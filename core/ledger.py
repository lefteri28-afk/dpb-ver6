"""
core/ledger.py

Implements the core Take / Give / Exact decision logic (PPA Section 4.C)
and tier configuration (PPA Section 4.A) for the DPB system.

This module is intentionally storage- and transport-agnostic: it operates
on a BalanceState object that may represent either the server-side shared
balance (B) during online operation, or a terminal-local reservoir (S_k)
during offline operation (PPA Section 4.D). The same decision function
applies to both, per Section 4.C: "For a transaction with local
fractional tail T at a terminal configured with unit U, while online...".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Optional


class EventType(str, Enum):
    TAKE = "take"      # round down, discount drawn from balance
    GIVE = "give"       # round up, surplus credited to balance
    EXACT = "exact"      # no fractional remainder


@dataclass(frozen=True)
class Tier:
    """A rounding-unit tier configuration (PPA Section 4.A)."""
    name: str
    unit_cents: int  # U, in integer cents

    def __post_init__(self):
        if self.unit_cents <= 0:
            raise ValueError(f"Tier '{self.name}': unit_cents must be positive")


# Illustrative tier set from PPA Section 4.A. Deployments may define
# additional or different tiers -- this set is not limiting.
PENNY_BIN = Tier("penny_bin", 5)
NICKEL_BIN = Tier("nickel_bin", 10)
DIME_BIN = Tier("dime_bin", 25)
QUARTER_BIN = Tier("quarter_bin", 100)

DEFAULT_TIERS = (PENNY_BIN, NICKEL_BIN, DIME_BIN, QUARTER_BIN)


def default_ceiling_cents(tiers=DEFAULT_TIERS) -> int:
    """
    PPA Section 4.B: B_max >= U_max - 1 cent, where U_max is the largest
    configured rounding unit. Returns the minimum sufficient ceiling for
    the given tier set.
    """
    u_max = max(t.unit_cents for t in tiers)
    return u_max - 1


def compute_tail(amount_cents: int, unit_cents: int) -> int:
    """
    PPA Section 4.A: T = S_cents mod U

    amount_cents should already be a rounded integer cent amount
    (S_cents = round(S * 100) -- see cents_from_amount below). Currency
    parsing/rounding policy is deliberately kept at the edge, not here.
    """
    if unit_cents <= 0:
        raise ValueError("unit_cents must be positive")
    return amount_cents % unit_cents


@dataclass
class BalanceState:
    """
    A bounded fractional balance. Used both for the server-side shared
    balance (B) and for a terminal-local reservoir (S_k) during offline
    operation (PPA Section 4.D).
    """
    balance_cents: int = 0
    ceiling_cents: int = field(default_factory=default_ceiling_cents)
    version: int = 0  # monotonic version, used for CAS (Section 4.B / 4.E)

    def __post_init__(self):
        if self.balance_cents < 0:
            raise ValueError("balance_cents cannot be negative")
        if self.ceiling_cents <= 0:
            raise ValueError("ceiling_cents must be positive")
        if self.balance_cents > self.ceiling_cents:
            raise ValueError("balance_cents cannot exceed ceiling_cents")


@dataclass
class DecisionResult:
    """Result of applying the Take/Give/Exact decision logic to a single
    transaction (PPA Section 4.C / FIG. 2)."""
    event_type: EventType
    tail_cents: int
    delta_cents: int          # signed change actually applied to the balance
    overflow_cents: int       # portion of a Give credit that exceeded the
                               # ceiling and was NOT applied (caller routes
                               # this to a local reservoir -- see
                               # reconciliation.py and PPA Section 4.C)
    discount_granted: bool    # True if a Take discount was actually applied
    new_balance_cents: int
    new_version: int


def decide_transaction(
    state: BalanceState,
    amount_cents: int,
    tier: Tier,
) -> DecisionResult:
    """
    Core Take / Give / Exact decision logic (PPA Section 4.C, FIG. 2).

    Pure with respect to `state`: does NOT mutate the passed-in
    BalanceState. Callers apply the result atomically via
    compare-and-swap against `state.version` (see reconciliation.py for
    the concurrency-safe wrapper used for the shared server balance B).
    """
    tail = compute_tail(amount_cents, tier.unit_cents)

    if tail == 0:
        return DecisionResult(
            event_type=EventType.EXACT,
            tail_cents=0,
            delta_cents=0,
            overflow_cents=0,
            discount_granted=False,
            new_balance_cents=state.balance_cents,
            new_version=state.version,
        )

    if state.balance_cents >= tail:
        # Take (round down): B_new = B - T
        new_balance = state.balance_cents - tail
        return DecisionResult(
            event_type=EventType.TAKE,
            tail_cents=tail,
            delta_cents=-tail,
            overflow_cents=0,
            discount_granted=True,
            new_balance_cents=new_balance,
            new_version=state.version + 1,
        )

    # Give (round up): B_new = B + (U - T), capped at ceiling.
    credit = tier.unit_cents - tail
    room = state.ceiling_cents - state.balance_cents
    applied = min(credit, room)
    overflow = credit - applied
    new_balance = state.balance_cents + applied

    return DecisionResult(
        event_type=EventType.GIVE,
        tail_cents=tail,
        delta_cents=applied,
        overflow_cents=overflow,
        discount_granted=False,
        new_balance_cents=new_balance,
        new_version=state.version + 1,
    )


def cents_from_amount(amount: Decimal) -> int:
    """
    S_cents = round(S * 100) (PPA Section 4.A).
    Uses ROUND_HALF_UP to match conventional cash-register rounding
    conventions; adjust if your jurisdiction requires banker's rounding.
    """
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
