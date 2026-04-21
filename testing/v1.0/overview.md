# v1.0 — Overview (Archive)

The first production release of HelmLogic. This overview exists so a tester
approaching v1.2/v1.3/v1.4 has the context to know what was already there.

---

## What shipped

### Stock Management
- Spreadsheet-style **Stock Boats Table** with 12 columns, sortable headers, client-side search, bulk delete, and status/material badges.
- Stock Item **Detail Panel** with photo gallery, catalog-photo fallback, PDF attachments.
- **Stock Item CRUD** — create, edit, auto-generated stock numbers.
- **Pending Tab** for in-progress stock entries.

### Quote Builder (Highfield boats)
- Multi-step flow: Variant → Colour + Registration → Motor → Trailer → Dealer Fit → Summary.
- Variant + material + colour selectors from `data-warehouse`.
- Registration pricing from `model.registration` (pre-v1.4 baseline).
- Motor picker from any `Motor Brand` module (e.g. Yamaha).
- Dealer Fit category list from `dealerFitCategories` (global) + module `moduleDealerFitCategories`.
- Summary → Finalize → quote saved under `users/{uid}/quotes/{quoteId}`.

### Proposals & PDFs
- `/modules/{id}/proposals` list view per module.
- Proposal page renders quote details; PDF export via `ProposalPDFDocument`.

### Module framework
- Module types at v1.0: **Catalog**, **Used Boats**, **Website Listings**, **Master Price File**, **Motor Brand**.
- Role assignment (Brand Captain, Module Manager).

### Data warehouse
- Three-level hierarchy: Vendor → Range → Model → Variant.
- Highfield seeded via `reseed-correct-vendor.py` (vendor ID `LafOLpLb6QIFE856TiD4`).

---

## Architectural decisions set here

- **Prices stored as `sellPriceExclGst`** (ex-GST). GST applied at finalize only.
- **Snapshot pattern on finalize** — variant specs, motor config, dealer fit selections frozen into the quote payload. Later catalog changes don't affect finalized quotes.
- **Next.js App Router** + **Firebase** (Firestore/Auth/Storage).
- **shadcn/ui** + Tailwind, deployed via Firebase App Hosting.

v1.1–v1.4 all build on this foundation. Nothing in v1.0 has been retired.

---

Full engineering changelog → [`release-notes.md`](./release-notes.md).
