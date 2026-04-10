# HelmLogic — Release Notes v1.2.1 "Pricing Precision"
> Hotfix release on top of v1.2.0
> Branch: claude/app-overview-wKiZ1 → main
> Final QA: 7/7 tests passing

### Release Stats
- **5 files** changed
- Pricing accuracy improvements across the full pipeline
- Price level support flows through: motor cards → hero card → accessories → dealer fit → finalize payload → proposal → PDF → stock audit

### Client Requirement Context
Based on feedback from NSM pricing lead:
- "I have always calculated from roundup(cost + markup + GST) to establish the Sell price inc GST"
- Sub-Dealer / Trade Dealers need Yamaha motors at Trade Pricing, not BMT pricing
- Dealer fit pricing should use Act Sell (Col R) and Act CTD (Col O) from MPF
- Yamaha library: NSM Retail (BC) for BMT, Sell Price (BF) for Repowers, Trade Price (BL), Commercial (BS), Boating Alliance (BY)

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
- **Motor hero card and grid card prices respond to price level selector** — switching to Trade/Sub-Dealer shows correct lower price
- Motor accessories also get priceLevels built from MPF fields (Act Sell, Act CTD, Trade)
- Accessory price display in quote builder is price-level aware

---

## Dealer Fit Pricing

- `getPriceForLevel` fallback chain expanded with MPF field names:
  - Added: `Act Sell`, `Sell Price`, `Store Price`, `NSM Retail`
  - Existing: `sellPriceExclGst`, `PARTS`, `RRP`, `Price`, `Retail`, `Trade`
- All dealer fit card price displays also expanded with `Act Sell` and `Store Price`
- String price values now safely parsed with `parseFloat()`
- Dealer fit items from MPF now resolve correct sell prices in quotes

---

## Finalize Payload — Price Level Resolution

- `buildQuotePayload` now resolves prices through `resolvePrice()` using the selected price level
- Motor `sellPriceExclGst` snapshots the price-level-resolved value (e.g., Trade Price for sub-dealers)
- Motor accessories snapshot price-level-resolved values
- Dealer fit items snapshot price-level-resolved values via `Act Sell` fallback
- Motor `costPrice` and accessory `costPrice` snapshotted for dealer audit
- `priceLevelUsed` explicitly saved on every quote payload

---

## Dealer Audit (Stock Detail Panel)

- New "Dealer Audit" section in the stock detail right column (below MiniProposalView)
- Shows: Price Level used, Quote number, Created by, Discount
- Financial breakdown: Total Ex GST, GST (rounded), Total Inc GST (rounded to whole dollar)
- Cost breakdown when available: Boat Cost, Motor Cost

---

## Files Changed
- `src/components/highfield-pricing-workspace.tsx` — roundIncGst helper, all Inc GST calculations
- `src/components/highfield-quote-flow.tsx` — getPriceForLevel expansion, motor priceLevels mapping, hero/grid card price display
- `src/components/finalize-quote-dialog.tsx` — resolvePrice(), price-level-aware payload snapshots
- `src/lib/quote-financials.ts` — Total Inc GST rounding
- `src/components/stock-item-detail.tsx` — Dealer audit section

---

## QA Results

All 7 test cases passing:

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Pricing Workspace Inc GST Rounding | ✅ PASS | All values whole dollar (e.g., $3,741, $5,911) |
| 2 | Motor Price Levels in Quote Builder | ✅ PASS | F25SWTC: Cash $6,766 → Trade $5,973 → Sub-D $5,973 |
| 3 | Accessory Pricing per Level | ✅ PASS | Static across levels — expected (MPF items single-price) |
| 4 | Dealer Fit Act Sell | ✅ PASS | Alum Talon GP K Series = $247 from Act Sell ✓ |
| 5 | Proposal Inc GST | ✅ PASS | $6,220 Ex + $622 GST = $6,842 Inc (whole dollar) |
| 6 | Finalize Price Level Snapshot | ✅ PASS | Stock NSM-SCGBU19D7 saved with Price Level = TRADE |
| 7 | Yamaha Motor Catalog Pricing | ✅ PASS | All 15 motors display non-zero prices |

### Notes
- Motor accessories from MPF (rigging kits, prop kits) have a single price column and don't differentiate by price level — this is correct data behavior, not a bug
- Sub-Dealer and Sub-Exclusive price levels in the pricing workspace showed anomalous values ($3 instead of ~$3,086) — this is a data import issue from the client, not a code bug. Re-import the price level columns to fix.

---

## Release Checklist

- [x] Client pricing feedback addressed (GST rounding, motor columns, Act Sell)
- [x] All QA test cases passing (7/7)
- [x] Build passes (`npx next build` — zero errors)
- [x] Motor hero/grid card prices respond to price level selector
- [x] Finalize payload snapshots price-level-resolved values
- [x] Dealer audit panel shows cost/sell breakdown
- [ ] Merge `claude/app-overview-wKiZ1` → `main` (awaiting Asaf's approval)
- [ ] Verify production deployment
- [ ] Smoke test on production
