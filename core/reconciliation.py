"""
core/reconciliation.py

Implements:
  - the version-checked compare-and-swap procedure used for ordinary
    online transactions (PPA Section 4.B);
  - offline terminal state management (PPA Section 4.D);
  - concurrency-safe, idempotent, ceiling-preserving reconciliation
    (PPA Section 4.E, FIG. 4); and
  - automatic resumption of cross-tier funding after reconciliation
    (PPA Section 4.F -- see LedgerServer.process_online_transaction,
    which is the same code path used before and after a terminal's
    disconnection, so no separate re-enablement step exists).

IMPORTANT FOR REVIEWERS: this reference implementation uses an in-process
lock (threading.Lock) to emulate the compare-and-swap procedure described
in the specification. That is sufficient for correctness within a single
server process, but a real multi-process/multi-instance deployment MUST
replace the locking in LedgerServer with a database-level CAS (e.g.,
`UPDATE ledger SET balance = :new, version = version + 1
 WHERE version = :expected` and checking the affected-row count) or an
equivalent distributed optimistic-concurrency mechanism. Swapping the
lock for a real DB CAS, and load-testing that swap, is the single most
important piece of review this module needs before it touches real
transactions -- flagging this explicitly per the project's stated goal
of professional concurrency review before production use.
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from .audit_chain import HmacChain
from .ledger import BalanceState, DecisionResult, Tier, decide_transaction


class BatchRejectedError(Exception):
    """Raised when a reconciliation batch fails HMAC verification."""


@dataclass
class ReconciliationOutcome:
    status: str  # "applied", "duplicate", "flagged_for_review"
    applied_cents: int = 0
    overflow_cents: int = 0
    new_balance_cents: Optional[int] = None
    reason: Optional[str] = None


class LedgerServer:
    """
    Server-side coordinator for the shared balance B (PPA Section 4.C) and
    the reconciliation / admission-control engine (PPA Section 4.E).
    """

    def __init__(
        self,
        ceiling_cents: int,
        audit_key: bytes,
        velocity_window_seconds: int = 3600,
        velocity_flag_multiplier: float = 5.0,
    ):
        self._lock = threading.Lock()
        self._state = BalanceState(balance_cents=0, ceiling_cents=ceiling_cents)
        self._audit_chain = HmacChain(key=audit_key)
        # Per-terminal idempotency ledger: terminal_id -> last applied batch_id
        self._applied_batches: dict = {}
        # Per-terminal recent activity samples, for the plausibility bound
        # (PPA Section 4.E.4): terminal_id -> list of (timestamp, count)
        self._terminal_history: dict = {}
        self._velocity_window_seconds = velocity_window_seconds
        self._velocity_flag_multiplier = velocity_flag_multiplier

    # -- Online transaction path (PPA Section 4.C, and 4.F resumption) --

    def process_online_transaction(
        self, terminal_id: str, tier: Tier, amount_cents: int, tx_id: Optional[str] = None,
    ) -> DecisionResult:
        """
        Processes a single online transaction against the shared balance B.

        This is deliberately the *only* code path for online transactions,
        used identically whether a terminal has been online continuously
        or has just completed reconciliation after a disconnection --
        which is what makes cross-tier funding resume automatically per
        PPA Section 4.F, with no separate re-enablement step.
        """
        tx_id = tx_id or str(uuid.uuid4())
        with self._lock:
            result = decide_transaction(self._state, amount_cents, tier)
            self._state = BalanceState(
                balance_cents=result.new_balance_cents,
                ceiling_cents=self._state.ceiling_cents,
                version=result.new_version,
            )
            self._audit_chain.append({
                "type": "online_transaction",
                "tx_id": tx_id,
                "terminal_id": terminal_id,
                "tier": tier.name,
                "event_type": result.event_type.value,
                "tail_cents": result.tail_cents,
                "delta_cents": result.delta_cents,
                "overflow_cents": result.overflow_cents,
                "resulting_balance_cents": result.new_balance_cents,
            })
            self._record_terminal_activity(terminal_id, count=1)
            return result

    @property
    def balance_cents(self) -> int:
        with self._lock:
            return self._state.balance_cents

    @property
    def ceiling_cents(self) -> int:
        return self._state.ceiling_cents

    def verify_audit_chain(self) -> bool:
        with self._lock:
            return self._audit_chain.verify_all()

    # -- Reconciliation path (PPA Section 4.E, FIG. 4) -------------------

    def reconcile_batch(
        self,
        terminal_id: str,
        batch_id: str,
        net_delta_cents: int,
        transaction_count: int,
        offline_chain: HmacChain,
        elapsed_offline_seconds: float,
    ) -> ReconciliationOutcome:
        """
        Admission-controlled, idempotent reconciliation of an offline
        terminal's accumulated batch delta into the shared balance B
        (PPA Section 4.E, FIG. 4).
        """
        with self._lock:
            # Step 1: idempotency check (Section 4.E.1)
            if self._applied_batches.get(terminal_id) == batch_id:
                return ReconciliationOutcome(status="duplicate")

            # Step 2: HMAC chain verification (Section 4.E.2)
            if not offline_chain.verify_all():
                raise BatchRejectedError(
                    f"Offline chain for terminal {terminal_id}, batch {batch_id} "
                    "failed HMAC verification."
                )

            # Step 3: plausibility bound (Section 4.E.4) -- a mitigation,
            # not a guarantee. HMAC verification alone proves the batch
            # was signed with this terminal's key, not that the
            # underlying transactions actually occurred at the register.
            if self._is_implausible(terminal_id, transaction_count, elapsed_offline_seconds):
                return ReconciliationOutcome(
                    status="flagged_for_review",
                    reason=(
                        f"Batch of {transaction_count} transactions over "
                        f"{elapsed_offline_seconds:.0f}s exceeds this terminal's "
                        f"historical velocity by more than "
                        f"{self._velocity_flag_multiplier}x."
                    ),
                )

            # Step 4: admission-controlled, ceiling-preserving application
            # (Section 4.E.3)
            current = self._state.balance_cents
            ceiling = self._state.ceiling_cents

            if net_delta_cents >= 0:
                room = ceiling - current
                applied = min(net_delta_cents, room)
                overflow = net_delta_cents - applied
            else:
                # A negative net delta (net discount drawn while offline)
                # is applied in full -- it cannot itself cause a ceiling
                # violation. The terminal's own local Take logic never
                # allows S_k to go negative (see ledger.decide_transaction),
                # so this value is bounded below by construction.
                applied = net_delta_cents
                overflow = 0

            new_balance = current + applied
            self._state = BalanceState(
                balance_cents=new_balance,
                ceiling_cents=ceiling,
                version=self._state.version + 1,
            )

            self._applied_batches[terminal_id] = batch_id
            self._record_terminal_activity(terminal_id, count=transaction_count)

            self._audit_chain.append({
                "type": "reconciliation",
                "terminal_id": terminal_id,
                "batch_id": batch_id,
                "net_delta_cents": net_delta_cents,
                "applied_cents": applied,
                "overflow_cents": overflow,
                "transaction_count": transaction_count,
                "resulting_balance_cents": new_balance,
            })

            return ReconciliationOutcome(
                status="applied",
                applied_cents=applied,
                overflow_cents=overflow,
                new_balance_cents=new_balance,
            )

    # -- Plausibility bound helpers (Section 4.E.4) -----------------------

    def _record_terminal_activity(self, terminal_id: str, count: int) -> None:
        now = time.time()
        history = self._terminal_history.setdefault(terminal_id, [])
        history.append((now, count))
        cutoff = now - self._velocity_window_seconds
        self._terminal_history[terminal_id] = [
            (t, c) for (t, c) in history if t >= cutoff
        ]

    def _is_implausible(
        self, terminal_id: str, batch_count: int, elapsed_offline_seconds: float
    ) -> bool:
        history = self._terminal_history.get(terminal_id)
        if not history or elapsed_offline_seconds <= 0:
            # No baseline yet. A production deployment should decide
            # explicitly whether "no history" means "allow" (as here) or
            # "flag for manual approval on first use", depending on risk
            # tolerance -- flagging this as an open policy decision, not
            # an oversight.
            return False

        total_count = sum(c for _, c in history)
        historical_rate_per_sec = total_count / self._velocity_window_seconds
        expected_count = historical_rate_per_sec * elapsed_offline_seconds
        if expected_count <= 0:
            return batch_count > 0
        return batch_count > expected_count * self._velocity_flag_multiplier


@dataclass
class OfflineTerminalState:
    """
    Terminal-side state during a disconnection episode (PPA Section 4.D).
    Tracks the local reservoir S_k, the local offline HMAC chain, and the
    batch identifier for this disconnection episode.
    """
    terminal_id: str
    tier: Tier
    reservoir: BalanceState
    local_chain: HmacChain
    batch_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    started_at: float = field(default_factory=time.time)
    seed_cents: int = 0  # reservoir balance at the moment of disconnection
    transaction_count: int = 0

    def process_offline_transaction(
        self, amount_cents: int, tx_id: Optional[str] = None
    ) -> DecisionResult:
        tx_id = tx_id or str(uuid.uuid4())
        result = decide_transaction(self.reservoir, amount_cents, self.tier)
        self.reservoir = BalanceState(
            balance_cents=result.new_balance_cents,
            ceiling_cents=self.reservoir.ceiling_cents,
            version=result.new_version,
        )
        self.local_chain.append({
            "type": "offline_transaction",
            "tx_id": tx_id,
            "terminal_id": self.terminal_id,
            "batch_id": self.batch_id,
            "event_type": result.event_type.value,
            "tail_cents": result.tail_cents,
            "delta_cents": result.delta_cents,
            "resulting_reservoir_cents": result.new_balance_cents,
        })
        self.transaction_count += 1
        return result

    def net_delta_cents(self) -> int:
        """
        Net effect of this offline episode on the shared balance
        (PPA Section 4.E), relative to the reservoir's value at the
        moment the terminal went offline.
        """
        return self.reservoir.balance_cents - self.seed_cents

    def elapsed_seconds(self) -> float:
        return time.time() - self.started_at
