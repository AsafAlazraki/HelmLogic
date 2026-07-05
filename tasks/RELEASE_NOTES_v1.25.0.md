# v1.25 — Quote tooling

**Date**: 2026-06-25 · **Branch**: dev → main · 4 stories shipped (E2E 2/2 + 18/18 file).

## Shipped
- **1.1.4 Quote Comparison Tool** — `/quote-comparison`, pick up to 3 quotes and compare side by side (customer / state / boat / total).
- **1.4.5 Quote Versioning per Customer** — version-chain helpers (groupVersionChains / latestInChain / nextVersionNumber) (lib).
- **1.6.1 Comms Log** — unified interaction timeline merging notes + quote audit events (lib).
- **2.4.6 Final / Tax Invoice** — settlement invoice builder with ABN + paid-to-date + balance-due, consuming the v1.23 payment schedule (lib).

## After merge
Run `scripts/ship-v125-features.py`.
