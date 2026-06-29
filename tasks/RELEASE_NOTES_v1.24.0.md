# v1.24 — Customer depth

**Date**: 2026-06-25 · **Branch**: dev → main · 3 stories shipped (E2E 3/3 + 14/14 file).

## Shipped
- **1.5.3 Customer Notes Timeline** — add-note input + timeline on the customer detail sheet; writes to `customers/{id}/notes`, increments `notesCount`. New notes subcollection rule.
- **8.1.3 Customer Pipeline View** — journey strip on the customer detail sheet showing stage position across the lifecycle.
- **2.5.1 Order Tracking** — factory-order state machine (ordered → in-production → shipped → arrived → delivered) + progress strip in the contract detail sheet.

## After merge
Publish firestore.rules (customers/{id}/notes). Run `scripts/ship-v124-features.py`.
