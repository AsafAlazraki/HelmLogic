# HelmLogic — Release Notes v1.2.1 "Pricing Precision"
> Hotfix release on top of v1.2.0
> Branch: claude/app-overview-wKiZ1 → main

### Release Stats
- **4 files** changed
- Pricing accuracy improvements across the full pipeline

---

## Inc GST Rounding

- All Inc GST values now rounded UP to whole dollars (`Math.ceil`) — matches client methodology
- Applied per item row in the pricing workspace: base cost, sea freight, road freight, handling, pre-delivery, all price level columns
- Applied to proposal/PDF totals: Total Inc GST = Math.ceil(Ex GST * 1.1), GST derived from that
- GP% calculation unchanged (derived from Ex GST, unaffected by rounding)

---

## Motor Price Levels

- Yamaha motors now have a `priceLevels` object built from their data columns:
  - `hull_cash` → NSM Retail (BMT package pricing)
  - `hull_trade` / `hull_subdealer` / `hull_subdealer_excl` → Trade Price
  - `hull_commercial` → Commercial Price
  - `hull_boating_alliance` → Boating Alliance Price
- Sub-dealers automatically get Trade Price on motors (via their defaultPriceLevel)
- Price level selector in quote builder now affects motor pricing correctly

---

## Dealer Fit Pricing

- `getPriceForLevel` fallback chain expanded with MPF field names:
  - Added: `Act Sell`, `Sell Price`, `Store Price`, `NSM Retail`
  - Existing: `sellPriceExclGst`, `PARTS`, `RRP`, `Price`, `Retail`, `Trade`
- String price values now safely parsed with `parseFloat()`
- Dealer fit items from MPF now resolve correct sell prices in quotes

---

## Dealer Audit (Stock Detail Panel)

- New "Dealer Audit" section in the stock detail right column (below MiniProposalView)
- Shows: Price Level used, Quote number, Created by, Discount
- Financial breakdown: Total Ex GST, GST (rounded), Total Inc GST (rounded to whole dollar)
- Cost breakdown when available: Boat Cost, Motor Cost

---

## Files Changed
- `src/components/highfield-pricing-workspace.tsx` — roundIncGst helper, all Inc GST calculations
- `src/components/highfield-quote-flow.tsx` — getPriceForLevel expansion, motor priceLevels mapping
- `src/lib/quote-financials.ts` — Total Inc GST rounding
- `src/components/stock-item-detail.tsx` — Dealer audit section
