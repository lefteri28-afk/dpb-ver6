<<<<<<< HEAD
DPB - Digital Penny Bin
A settlement-free fractional-value pooling system for heterogeneous point-of-sale networks.

Status: Early / pre-production.

Patent Pending: U.S. Provisional Patent Application filed September 2026.

Looking for contributors to help harden the core engine and build platform integrations — see How to Contribute below.

What is DPB?
DPB lets point-of-sale terminals — even ones configured with completely different rounding rules (round to the nearest nickel vs. round to the nearest dollar) — share a single pooled balance for fractional-cent change.

Instead of a customer's $0.03 in change disappearing into a coin jar or a rounding error, it gets tracked in a shared ledger and used to give the next customer, at any connected terminal, a discount that rounds their total down instead of up.

The core technical problems this project solves:
Cross-tier funding: A terminal configured for dollar-level rounding can fund discounts at a terminal configured for nickel-level rounding, without either terminal knowing the other exists.
Offline tolerance: A terminal that loses its network connection keeps working against a local buffer, and reconciles back into the shared ledger when it reconnects, without corrupting the shared balance even if multiple terminals reconnect at once.
Tamper-evident auditing: Every balance change is chained cryptographically (HMAC-SHA256) so the full history is verifiable.
Full technical detail is in /docs/architecture.md.

Honesty About Where This Project Is Right Now
I built the core design and initial implementation with heavy AI-assisted development, working through the architecture, edge cases, and prior art landscape in detail, but without a traditional software engineering background of my own.

The core logic and system design are original work that I've stress-tested as hard as I can on my end, but this codebase has not been reviewed by professional engineers for production-grade concurrency safety, security hardening, or scale.

That's exactly why this repo exists: I'm looking for engineers who can review the concurrency model, harden the reconciliation logic, write real test coverage, and build the platform integrations I can't build myself. If that sounds like an interesting problem, I'd genuinely welcome the help.

Patent Status
A U.S. Provisional Patent Application covering the cross-tier funding mechanism and offline reconciliation protocol was filed in September 2026. A provisional application is not an issued patent and does not guarantee one will be granted — it establishes a priority date while the underlying invention is evaluated further.

License
(This project is preparing to utilize a specialized licensing model, such as the Business Source License (BSL), to allow open viewing and contribution while preserving commercialization rights during an initial period. Full license terms will be updated here shortly.)

Repository Structure
dpb/
├── core/                               # Ledger engine, tier logic, reconciliation
│   ├── ledger.py                       # Shared balance, Take/Give/Exact decision logic
│   ├── reconciliation.py               # Admission control, idempotency, offline sync
│   └── audit_chain.py                  # HMAC-SHA256 chaining
├── adapters/                           # Platform-specific integrations
│   ├── square/                         # (help wanted)
│   ├── toast/                          # (help wanted)
│   ├── odoo/                           # (help wanted)
│   └── generic_rest/                   # Minimal reference REST API
├── docs/
│   ├── architecture.md                 # Full technical writeup
│   └── reconciliation-protocol.md
├── tests/
└── CONTRIBUTING.md
The core engine is deliberately platform-agnostic. Adapters translate between a specific POS platform's API/webhook model and the core engine's transaction interface — contributing an adapter doesn't require understanding the reconciliation internals, and contributing to the core doesn't require knowing any specific POS platform.

What Help Is Actually Needed
Roughly in priority order:

Concurrency review: The reconciliation engine uses version-checked compare-and-swap to serialize concurrent terminal writes and admission-control logic to prevent the shared balance's ceiling from being exceeded when multiple offline terminals reconcile at once. This needs eyes from someone with real distributed-systems experience.
Test coverage: The core Take/Give/Exact logic, tier boundary conditions, and reconciliation edge cases (concurrent reconnects, duplicate batch submission, partial ceiling admission) need real test suites.
Security review: Particularly around HMAC key management and the plausibility/anomaly-detection bounds on offline batch reconciliation.
Platform adapters: Square, Toast, Odoo, Clover, and others. If you know one of these platforms well, this is the most self-contained way to contribute.
Documentation: Clearer setup instructions, a proper API reference, and a "getting started" path for someone spinning this up for the first time.

Check CONTRIBUTING.md for good-first-issue labels.

What's in It for Contributors
Open-source credit and collaborative development on a genuinely interesting distributed-systems problem (heterogeneous consensus over a bounded shared resource with offline-tolerant reconciliation).
Future alignment: [TO BE FINALIZED — structure under development for rewarding significant early contributors as the project matures toward commercialization].

Contributing & IP Housekeeping
Before any pull request is merged, contributors will be asked to agree to a Developer Certificate of Origin (DCO) or Contributor License Agreement (mechanism TBD, see CONTRIBUTING.md).

This is to keep a clean, unambiguous ownership record for the codebase as the project evolves.

Getting Started
(Setup instructions coming soon)

Questions & Getting in Touch
(Contact method / GitHub Discussions coming soon)
=======
# 🪙 Digital Penny Bin API Server

An open-source, private cloud ledger system that digitizes the classic "give a penny, take a penny" counter tray. Built using Node.js and TypeScript, this server connects directly to Point of Sale (POS) merchant registers to eliminate fractional change friction by rounding totals to clean nickel boundaries.

---

## 📐 Core Mathematical Logic

The ledger maintains a strict community balance cap bound between **0¢ and 4¢**. Let `B` be the current bin balance and `T` be the fractional cent portion of the transaction bill ($0.01 to $0.04 over the nearest nickel).

1. **Take a Penny (`B >= T`)**: If the bin has enough pennies, the transaction total rounds **DOWN** to the nearest nickel. The difference is deducted from the bin (`B_new = B - T`).
2. **Give a Penny (`B < T`)**: If the bin is too low, the transaction total rounds **UP** to the nearest nickel. The customer overpays by the difference, which is credited to the bin (`B_new = B + (5 - T)`).

---

## 📡 API Integration Map

The server provides a unified REST endpoint that any external cash register can ping during a checkout sequence.

### POST `/api/pos/transaction`

**Request Payload (from POS terminal):**
```json
{
  "transactionCents": 3
}
```

**Response Payload (returned to POS terminal):**
```json
{
  "status": "success",
  "action": "ROUND_DOWN",
  "adjustmentCents": 3,
  "currentBinBalance": 1
}
```

---

## 🛠️ How to Help: Open Source Integration Roadmaps

We are looking for volunteer software engineers and POS developers to help write lightweight background integration plugins for the following retail hardware networks:

*   **Toast / Square**: Looking for wrappers to catch checkout checkout values using standard platform webhooks.
*   **Clover**: Need a lightweight Android SDK module to communicate with our endpoint from active merchant screens.
*   **Odoo**: Looking for a Python connector extension module built into the core point-of-sale checkout stack.

---

## 🚀 Quickstart Local Workspace

To spin up the server and interact with the visual cash register panel natively on your local machine, execute:

```bash
# 1. Install project structures
npm install

# 2. Run the cloud server backend
node --experimental-strip-types server.ts
```

Once running, navigate your web browser to **`http://localhost:3000`** to access the interactive POS checkout testing simulator interface.
>>>>>>> 6800c5a9e9665bb2525e1690e41f553fbf728d1c
