<<<<<<< HEAD
DPB - Digital Penny Bin
A settlement-free fractional-value pooling system for heterogeneous point-of-sale networks.
=======
What is Digital Penny Bin (DPB)?

DPB is a digital version of the classic "give a penny / take a penny" tray found next to cash registers. Instead of a plastic bin, the change is stored in a shared ledger and used to conduct cashless micro-transactions at the point-of-sale (POS).

In essence, DPB provides a settlement-free fractional-value pooling system for heterogeneous POS networks. It allows POS terminals — even ones configured with completely different rounding rules (round to the nearest nickel vs. round to the nearest dollar) — share a single pooled balance for fractional-cent change.

Instead of a customer's $0.03 in change disappearing into a coin jar or a rounding error, it gets tracked in a shared ledger and used to give the next customer, at any connected terminal, a discount that rounds their total down instead of up.
>>>>>>> 8c1e973f1f167fd454f18711667bcbc0a978a952

Status: Early / pre-production.

Patent Pending: U.S. Provisional Patent Application filed September 2026.

Looking for contributors to help harden the core engine and build platform integrations — see How to Contribute below.

<<<<<<< HEAD
What is DPB?
DPB lets point-of-sale terminals — even ones configured with completely different rounding rules (round to the nearest nickel vs. round to the nearest dollar) — share a single pooled balance for fractional-cent change.

Instead of a customer's $0.03 in change disappearing into a coin jar or a rounding error, it gets tracked in a shared ledger and used to give the next customer, at any connected terminal, a discount that rounds their total down instead of up.

The core technical problems this project solves:
Cross-tier funding: A terminal configured for dollar-level rounding can fund discounts at a terminal configured for nickel-level rounding, without either terminal knowing the other exists.
Offline tolerance: A terminal that loses its network connection keeps working against a local buffer, and reconciles back into the shared ledger when it reconnects, without corrupting the shared balance even if multiple terminals reconnect at once.
Tamper-evident auditing: Every balance change is chained cryptographically (HMAC-SHA256) so the full history is verifiable.
Full technical detail is in /docs/architecture.md.

Honesty About Where This Project Is Right Now
=======
The core technical problems this project solves:

Cross-tier funding: A terminal configured for dollar-level rounding can fund discounts at a terminal configured for nickel-level rounding, without either terminal knowing the other exists.

Offline tolerance: A terminal that loses its network connection keeps working against a local buffer, and reconciles back into the shared ledger when it reconnects, without corrupting the shared balance even if multiple terminals reconnect at once.

Tamper-evident auditing: Every balance change is chained cryptographically (HMAC-SHA256) so the full history is verifiable.

Full technical detail is in /docs/architecture.md.

Honesty About Where This Project Is Right Now

>>>>>>> 8c1e973f1f167fd454f18711667bcbc0a978a952
I built the core design and initial implementation with heavy AI-assisted development, working through the architecture, edge cases, and prior art landscape in detail, but without a traditional software engineering background of my own.

The core logic and system design are original work that I've stress-tested as hard as I can on my end, but this codebase has not been reviewed by professional engineers for production-grade concurrency safety, security hardening, or scale.

That's exactly why this repo exists: I'm looking for engineers who can review the concurrency model, harden the reconciliation logic, write real test coverage, and build the platform integrations I can't build myself. If that sounds like an interesting problem, I'd genuinely welcome the help.

Patent Status
<<<<<<< HEAD
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
=======

A U.S. Provisional Patent Application covering the cross-tier funding mechanism and offline reconciliation protocol was filed in September 2026. A provisional application is not an issued patent and does not guarantee one will be granted — it establishes a priority date while the underlying invention is evaluated further.

License

(This project is preparing to utilize a specialized licensing model, such as the Business Source License (BSL), to allow open viewing and contribution while preserving commercialization rights during an initial period. Full license terms will be updated here shortly.)

Repository Structure

```text
dpb/
├── core/                                # Ledger engine, tier logic, reconciliation
│   ├── ledger.py                        # Shared balance, Take/Give/Exact decision logic
│   ├── reconciliation.py                # Admission control, idempotency, offline sync
│   └── audit_chain.py                   # HMAC-SHA256 chaining
├── adapters/                            # Platform-specific integrations
│   ├── square/                          # (help wanted)
│   ├── toast/                           # (help wanted)
│   ├── odoo/                            # (help wanted)
│   └── generic_rest/                    # Minimal reference REST API
├── docs/
│   ├── architecture.md                  # Full technical writeup
│   └── reconciliation-protocol.md
├── tests/
└── CONTRIBUTING.md
```
The core engine is deliberately platform-agnostic. Adapters translate between a specific POS platform's API/webhook model and the core engine's transaction interface — contributing an adapter doesn't require understanding the reconciliation internals, and contributing to the core doesn't require knowing any specific POS platform.

What Help Is Actually Needed

Concurrency review: The reconciliation engine uses version-checked compare-and-swap to serialize concurrent terminal writes and admission-control logic to prevent the shared balance's ceiling from being exceeded when multiple offline terminals reconcile at once. This needs eyes from someone with real distributed-systems experience.

Test coverage: The core Take/Give/Exact logic, tier boundary conditions, and reconciliation edge cases (concurrent reconnects, duplicate batch submission, partial ceiling admission) need real test suites.

Security review: Particularly around HMAC key management and the plausibility/anomaly-detection bounds on offline batch reconciliation.

Platform adapters: Square, Toast, Odoo, Clover, and others. If you know one of these platforms well, this is the most self-contained way to contribute.

>>>>>>> 8c1e973f1f167fd454f18711667bcbc0a978a952
Documentation: Clearer setup instructions, a proper API reference, and a "getting started" path for someone spinning this up for the first time.

Check CONTRIBUTING.md for good-first-issue labels.

What's in It for Contributors
<<<<<<< HEAD
=======

>>>>>>> 8c1e973f1f167fd454f18711667bcbc0a978a952
Open-source credit and collaborative development on a genuinely interesting distributed-systems problem (heterogeneous consensus over a bounded shared resource with offline-tolerant reconciliation).
Future alignment: [TO BE FINALIZED — structure under development for rewarding significant early contributors as the project matures toward commercialization].

Contributing & IP Housekeeping
<<<<<<< HEAD
=======

>>>>>>> 8c1e973f1f167fd454f18711667bcbc0a978a952
Before any pull request is merged, contributors will be asked to agree to a Developer Certificate of Origin (DCO) or Contributor License Agreement (mechanism TBD, see CONTRIBUTING.md).

This is to keep a clean, unambiguous ownership record for the codebase as the project evolves.

Getting Started
<<<<<<< HEAD
(Setup instructions coming soon)
=======

Running the POS UI & Demo Server
The POS interface and demonstration server run on Python 3 using built-in standard libraries (no external heavy frameworks required).

Prerequisites
Python 3.10+
Git

Step 1: Clone the Repository

git clone 
[https://github.com/lefteri28-afk/digital-penny-bin.git](https://github.com/lefteri28-afk/digital-penny-bin.git)

Step 2: Navigate into the folder

cd digital-penny-bin

Step 3: Start the folder

*MacOS/Linux

python3 -m adapters.generic_rest.server

*Windows

python -m adapters.generic_rest.server

Step 4: View the UI

Open your browser and go to http://localhost:8000
>>>>>>> 8c1e973f1f167fd454f18711667bcbc0a978a952

Questions & Getting in Touch
(Contact method / GitHub Discussions coming soon)
