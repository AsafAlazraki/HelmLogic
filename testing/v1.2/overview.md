# v1.2 — Overview (Archive)

Released 2026-04-10. 87 commits, 65 files changed, 4,423 lines of new code.

---

## What shipped

### Yamaha Motor Module
- New `YamahaMotorWorkspace` with **Catalog**, **Pricing Manager**, **Promotions**, **Settings** tabs.
- Motor card grid grouped by HP range (2.5–25, 30–75, 90–150, 175–250, 300+).
- Detail Sheet: full specs, image, accessories by category, dealer fit options via Master Data Browser.
- Module detection: `moduleType === 'motor-brand'` OR vendor `vendorType === 'Motor Brand'`.

### Motor specs on proposals & PDFs
- Proposal view shows motor image + brand logo + specs table (HP, Shaft, Control, Starting, Tilt & Trim, Fuel Tank, Prop, Warranty).
- Motor accessories listed individually with prices.
- Finalize snapshots motor spec fields into the quote doc (hpRating, shaftLength, control, etc.).

### Motor Step UX (quote builder)
- Hero card replacement for grid on first motor selection.
- Prop Comes Standard toggle (default OFF — opt-in by design).
- Motor dealer-fit section surfaces `motorDealerFitCategories` from the boat module.

### Price-level coverage
- Price level now flows end-to-end: motor cards → hero card → accessories → dealer fit → finalize payload → proposal → PDF.
- Yamaha columns map to levels:
  - `hull_cash` → NSM Retail
  - `hull_trade` / `hull_subdealer` → Trade Price
  - `hull_commercial` → Commercial Price
  - `hull_boating_alliance` → Boating Alliance Price

### Other notable fixes
- `getMotorHp()` helper handles "2 × 300" multi-engine HP parsing correctly.
- `formatCurrency` auto-detects whole-dollar values (no trailing `.00`).

---

## Why it matters for later testers

v1.2 established the **motor-brand module pattern** that v1.4's Trailers
module copies. Both have Catalog + Pricing Manager + Settings tabs, both
flow through the four-source dealer-fit merge (boat + motor + trailer +
global), and both use snapshot-on-select in the quote flow.

If motor features stop working in v1.3 or v1.4 tests, the baseline to
compare against is in [`release-notes.md`](./release-notes.md) here.

---

Full engineering changelog → [`release-notes.md`](./release-notes.md).
QA records → [`test-cases.md`](./test-cases.md) + [`test-results.md`](./test-results.md).
