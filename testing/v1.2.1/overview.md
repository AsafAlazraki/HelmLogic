# v1.2.1 — Overview (Archive)

Released 2026-04-10 as a hotfix on top of v1.2. 5 files changed. Addresses
direct client feedback from NSM's pricing lead.

---

## Client feedback that drove this release

Direct quotes from the NSM pricing lead:
- *"I have always calculated from `roundup(cost + markup + GST)` to establish the Sell price inc GST"*
- Sub-Dealer / Trade Dealers need Yamaha motors at Trade Pricing, not BMT.
- Dealer Fit pricing should use **Act Sell** and **Act CTD** from MPF.
- Yamaha library columns mapping: NSM Retail (BC), Sell Price (BF), Trade (BL), Commercial (BS), Boating Alliance (BY).

---

## What shipped

### Inc GST rounding
- All Inc GST values rounded UP to whole dollars using `Math.ceil(exGst × gstMultiplier)`.
- Applied **per item row** in Pricing Workspace (base cost, sea freight, road freight, handling, pre-delivery).
- Applied across all price levels: `hull_cash`, `hull_trade`, `hull_subdealer`, `hull_subdealer_excl`, `hull_aus_sailing`.
- Applied to SRP columns (Sub-D SRP, Sub-Ex SRP).
- GP% calculation unchanged (derived from Ex GST, unaffected by rounding).

### Motor pricing mapping (Yamaha)
- `hull_cash` → NSM Retail
- `hull_trade` / `hull_subdealer` → Trade Price
- `hull_commercial` → Commercial Price
- `hull_boating_alliance` → Boating Alliance Price

### Dealer Fit pricing source
- MPF data uses **Act Sell** (actual sell price) and **Act CTD** (actual cost to dealer) as primary price/cost fields.

### Finalize payload
- Now resolves prices through the **selected price level** via `resolvePrice()` — not raw `sellPriceExclGst`.
- Prevents sub-dealer quotes from snapshotting retail prices by accident.

---

## Why it matters for later testers

If a quote total looks a dollar off, check the Inc GST rounding rule first
— it's **UP to whole dollar per row**, not "2dp nearest cent" and not "sum
then round". This is intentional and documented here.

If dealer fit prices look wrong on a sub-dealer quote, confirm the MPF data
has both `Act Sell` and `Act CTD` populated on the relevant items.

---

Full engineering changelog → [`release-notes.md`](./release-notes.md).
