# Generic REST Adapter (reference / starting point)

This is intentionally a stub, not a full adapter. It exists to show the
shape of the integration boundary between the core engine
(`core/reconciliation.py`'s `LedgerServer`) and any specific POS platform.

A real adapter for Square, Toast, Odoo, etc. needs to:

1. Receive that platform's transaction/webhook event.
2. Extract the transaction amount and the terminal's configured tier.
3. Call `LedgerServer.process_online_transaction(...)`.
4. Translate the `DecisionResult` back into whatever that platform's API
   expects (e.g., a line-item discount, a modified total, a receipt
   annotation).
5. Handle that platform's own offline/connectivity model, if any, and
   map it onto `OfflineTerminalState` / `LedgerServer.reconcile_batch(...)`.

This is the most self-contained way to contribute if you know one of
these platforms well — see the main README's "What help is actually
needed" section.
