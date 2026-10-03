"""
Sanity tests for the core DPB engine. These are not exhaustive -- per the
README, real concurrency and security review from professional engineers
is still needed -- but they validate the specific scenarios described in
the PPA (Figure 5's worked example, the ceiling-preservation guarantee
under concurrent reconciliation, and the idempotency guarantee).
"""

import os
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import (
    PENNY_BIN, QUARTER_BIN, DEFAULT_TIERS,
    decide_transaction, compute_tail, default_ceiling_cents,
    BalanceState, EventType,
    HmacChain,
    LedgerServer, OfflineTerminalState,
)


def test_default_ceiling_is_99_cents():
    assert default_ceiling_cents(DEFAULT_TIERS) == 99


def test_tail_computation():
    # $4.25 at Quarter Bin (U=100): T = 425 mod 100 = 25
    assert compute_tail(425, QUARTER_BIN.unit_cents) == 25
    # $2.03 at Penny Bin (U=5): T = 203 mod 5 = 3
    assert compute_tail(203, PENNY_BIN.unit_cents) == 3


def test_exact_change_event():
    state = BalanceState(balance_cents=10, ceiling_cents=99)
    result = decide_transaction(state, amount_cents=500, tier=QUARTER_BIN)  # $5.00 exact
    assert result.event_type == EventType.EXACT
    assert result.new_balance_cents == 10


def test_figure_5_worked_example():
    """
    Reproduces the corrected FIG. 5 example from the PPA:
      - Terminal A (Quarter Bin, U=$1.00), $4.25 transaction -> Give,
        T=$0.25, credit (U-T)=$0.75
      - Shared balance starts at $0.10, credited to $0.85 (within $0.99 ceiling)
      - Terminal B (Penny Bin, U=$0.05), $2.03 transaction -> Take,
        T=$0.03, drawn from the balance Terminal A funded
    """
    server = LedgerServer(ceiling_cents=99, audit_key=b"test-key")
    # Seed the shared balance to $0.10 to match the figure.
    server._state = BalanceState(balance_cents=10, ceiling_cents=99)  # test-only seed

    result_a = server.process_online_transaction(
        terminal_id="terminal_A", tier=QUARTER_BIN, amount_cents=425
    )
    assert result_a.event_type == EventType.GIVE
    assert result_a.tail_cents == 25
    assert result_a.delta_cents == 75  # credit = U - T = 100 - 25
    assert server.balance_cents == 85

    result_b = server.process_online_transaction(
        terminal_id="terminal_B", tier=PENNY_BIN, amount_cents=203
    )
    assert result_b.event_type == EventType.TAKE
    assert result_b.tail_cents == 3
    assert result_b.discount_granted is True
    assert server.balance_cents == 82  # 85 - 3

    assert server.verify_audit_chain() is True


def test_give_event_capped_at_ceiling_with_overflow():
    # Small remaining room (ceiling=10, balance=5 -> room=5) and a Give
    # event whose credit (94) far exceeds that room. The credit must be
    # capped at the ceiling, with the remainder reported as overflow
    # rather than silently lost.
    state = BalanceState(balance_cents=5, ceiling_cents=10)
    result = decide_transaction(state, amount_cents=106, tier=QUARTER_BIN)  # T=6, credit=94
    assert result.event_type == EventType.GIVE
    assert result.tail_cents == 6
    assert result.delta_cents == 5          # only room for +5 (5 -> 10)
    assert result.overflow_cents == 89      # 94 - 5
    assert result.new_balance_cents == 10


def test_reconciliation_is_idempotent():
    server = LedgerServer(ceiling_cents=99, audit_key=b"test-key")
    chain = HmacChain(key=b"terminal-1-key")
    chain.append({"type": "offline_transaction", "delta_cents": 20})

    outcome_1 = server.reconcile_batch(
        terminal_id="t1", batch_id="batch-abc", net_delta_cents=20,
        transaction_count=1, offline_chain=chain, elapsed_offline_seconds=60,
    )
    assert outcome_1.status == "applied"
    assert server.balance_cents == 20

    # Simulate a lost acknowledgment: terminal retries the same batch_id.
    outcome_2 = server.reconcile_batch(
        terminal_id="t1", batch_id="batch-abc", net_delta_cents=20,
        transaction_count=1, offline_chain=chain, elapsed_offline_seconds=60,
    )
    assert outcome_2.status == "duplicate"
    assert server.balance_cents == 20  # unchanged -- not double-applied


def test_reconciliation_preserves_ceiling_under_concurrent_batches():
    """
    Two terminals each accumulated $0.60 offline; both reconcile at once.
    The shared ceiling ($0.99) must not be exceeded, and no value should
    be silently discarded -- the excess must be reported as overflow.
    """
    server = LedgerServer(ceiling_cents=99, audit_key=b"test-key")
    chain_a = HmacChain(key=b"key-a")
    chain_a.append({"delta_cents": 60})
    chain_b = HmacChain(key=b"key-b")
    chain_b.append({"delta_cents": 60})

    results = {}

    def reconcile(term_id, chain):
        results[term_id] = server.reconcile_batch(
            terminal_id=term_id, batch_id="batch-1", net_delta_cents=60,
            transaction_count=1, offline_chain=chain, elapsed_offline_seconds=120,
        )

    t1 = threading.Thread(target=reconcile, args=("term_a", chain_a))
    t2 = threading.Thread(target=reconcile, args=("term_b", chain_b))
    t1.start(); t2.start()
    t1.join(); t2.join()

    assert server.balance_cents <= 99
    total_applied = results["term_a"].applied_cents + results["term_b"].applied_cents
    total_overflow = results["term_a"].overflow_cents + results["term_b"].overflow_cents
    # Nothing lost: applied + overflow across both terminals equals 120 cents total.
    assert total_applied + total_overflow == 120
    assert server.balance_cents == total_applied


def test_offline_terminal_then_reconcile_end_to_end():
    server = LedgerServer(ceiling_cents=99, audit_key=b"server-key")
    offline_state = OfflineTerminalState(
        terminal_id="t9",
        tier=QUARTER_BIN,
        reservoir=BalanceState(balance_cents=0, ceiling_cents=99),
        local_chain=HmacChain(key=b"t9-key"),
        seed_cents=0,
    )

    # $1.75 transaction while offline -> Give, T=75, credit=25
    offline_state.process_offline_transaction(amount_cents=175)
    assert offline_state.reservoir.balance_cents == 25
    assert offline_state.local_chain.verify_all() is True

    outcome = server.reconcile_batch(
        terminal_id=offline_state.terminal_id,
        batch_id=offline_state.batch_id,
        net_delta_cents=offline_state.net_delta_cents(),
        transaction_count=offline_state.transaction_count,
        offline_chain=offline_state.local_chain,
        elapsed_offline_seconds=offline_state.elapsed_seconds(),
    )
    assert outcome.status == "applied"
    assert server.balance_cents == 25

    # Cross-tier funding resumes automatically (Section 4.F): next online
    # transaction at a DIFFERENT terminal/tier can immediately draw on it.
    result = server.process_online_transaction(
        terminal_id="t_other", tier=PENNY_BIN, amount_cents=203  # T=3
    )
    assert result.event_type == EventType.TAKE
    assert server.balance_cents == 22


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-v"]))
