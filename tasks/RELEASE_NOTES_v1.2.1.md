# HelmLogic — Release Notes v1.2.1 "Pricing Precision"
> Release Date: 2026-04-10
> Branch: claude/app-overview-wKiZ1 → main
> Hotfix release on top of v1.2.0

### Release Stats
- **5 files** changed
- Pricing accuracy improvements across the full pipeline
- Price level support flows through: motor cards → hero card → accessories → dealer fit → finalize payload → proposal → PDF → stock audit
- **7/7 QA test cases** — all passing

### Client Requirement Context
Based on feedback from NSM pricing lead:
- "I have always calculated from roundup(cost + markup + GST) to establish the Sell price inc GST"
- Sub-Dealer / Trade Dealers need Yamaha motors at Trade Pricing, not BMT pricing
- Dealer fit pricing should use Act Sell (Col R) and Act CTD (Col O) from MPF
- Yamaha library: NSM Retail (BC) for BMT, Sell Price (BF) for Repowers, Trade Price (BL), Commercial (BS), Boating Alliance (BY)

---

## Inc GST Rounding

### Pricing Workspace
- All Inc GST values now rounded UP to whole dollars (`Math.ceil`) — matches client methodology
- Applied per item row: base cost, sea freight, road freight, handling, pre-delivery
- Applied to all price level columns: hull_cash, hull_trade, hull_subdealer, hull_subdealer_excl, hull_aus_sailing
- Applied to SRP columns (Sub-D SRP, Sub-Ex SRP)
- GP% calculation unchanged (derived from Ex GST, unaffected by rounding)

### Proposals & PDFs
- Total Inc GST = `Math.ceil(Ex GST * 1.1)` — whole dollar amount
- GST amount derived from the rounded total, not calculated separately

---

## Motor Price Levels

### Yamaha Column Mapping
Motors now have a `priceLevels` object built from their data columns:
- `hull_cash` → NSM Retail (BMT package pricing)
- `hull_trade` / `hull_subdealer` / `hull_subdealer_excl` → Trade Price
- `hull_commercial` → Commercial Price
- `hull_boating_alliance` → Boating Alliance Price

### Sub-Dealer Behaviour
- Sub-dealers automatically get Trade Price on motors via their `defaultPriceLevel`
- When building a quote with price level "Trade Price", motor hero card and grid card prices change to match
- Motor accessory priceLevels also built from MPF fields (Act Sell, Act CTD, Trade)

### Quote Builder Price Display
- Motor hero card and grid card prices use `getPriceForLevel(motor, priceLevel)` — previously hardcoded to `sellPriceExclGst`
- Accessory price display is price-level aware
- Switching price level in the selector correctly updates all displayed prices

---

## Dealer Fit Pricing

### getPriceForLevel Fallback Chain
The price resolution function now checks these fields in order:
1. `priceLevels[level]` (when price level is set)
2. `sellPriceExclGst`
3. `Act Sell` (MPF primary sell column)
4. `Sell Price`
5. `Store Price`
6. `NSM Retail`
7. `PARTS`, `RRP`, `Price`, `Retail`, `Trade`

### Card Display Fixes
- All dealer fit card price displays expanded with `Act Sell` and `Store Price` fallbacks
- String price values safely parsed with `parseFloat()`
- Dealer fit items from MPF now resolve correct sell prices in quotes

---

## Finalize Payload — Price Level Resolution

### resolvePrice() Helper
- `buildQuotePayload` uses `resolvePrice()` to snapshot values at the selected price level
- Motor `sellPriceExclGst` snapshots the price-level-resolved value (e.g., Trade Price for sub-dealers)
- Motor accessories snapshot price-level-resolved values
- Dealer fit items snapshot price-level-resolved values via `Act Sell` fallback

### Audit Fields
- Motor `costPrice` and accessory `costPrice` now snapshotted for dealer audit
- `priceLevelUsed` explicitly saved on every quote payload

---

## Dealer Audit (Stock Detail Panel)

### New Section
A "Dealer Audit" card now appears in the stock detail right column (below MiniProposalView) for quote-origin items.

### Fields Shown
- Price Level used (e.g., "cash", "trade", "sub dealer")
- Quote number
- Created by (user name)
- Discount (if applied)
- Total Ex GST
- GST (rounded)
- Total Inc GST (whole dollar)

### Cost Breakdown
When cost data is available:
- Boat Cost
- Motor Cost

---

## Files Changed (Key Components)
- `src/components/highfield-pricing-workspace.tsx` — roundIncGst helper, all Inc GST calculations
- `src/components/highfield-quote-flow.tsx` — getPriceForLevel expansion, motor priceLevels mapping, hero/grid card price display
- `src/components/finalize-quote-dialog.tsx` — resolvePrice(), price-level-aware payload snapshots
- `src/lib/quote-financials.ts` — Total Inc GST rounding
- `src/components/stock-item-detail.tsx` — Dealer audit section
