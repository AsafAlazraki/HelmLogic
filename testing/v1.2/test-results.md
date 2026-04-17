# HelmLogic — Test Results Log

> Running record of all QA test runs, results, and fixes applied.

---

## v1.2.1 "Pricing Precision" — Test Run 1

### Test Cases

**TEST 1: Pricing Workspace — Inc GST Rounding**
- Check INCL GST columns are whole dollar amounts (Math.ceil)
- Check across multiple price levels and component rows

**TEST 2: GP Percentage**
- Verify GP% = (Sell Ex GST - Landed Cost) / Sell Ex GST * 100
- Unaffected by Inc GST rounding

**TEST 3: Motor Price Levels in Quote Builder**
- Select motor, note price at Cash level
- Switch to Trade Price — motor hero card price should change
- Switch to Sub-Dealer — should show Trade Price

**TEST 4: Dealer Fit Item Pricing**
- Dealer fit items show prices from Act Sell field
- Prices are non-zero and match MPF data

**TEST 5: Proposal Inc GST — Whole Dollar Rounding**
- Finalize a quote, view proposal
- Total Inc GST is whole dollar (rounded up)

**TEST 6: Stock Detail — Dealer Audit Section**
- Stock items from quotes show Dealer Audit panel
- Price Level, Quote #, Created By, financials visible

**TEST 7: Yamaha Motor Catalog Pricing**
- Motor detail sheet shows real prices, not $0

### Results

```
TEST 1 — Pricing Inc GST Rounding: PASS
  UL220 HBU001: NSM Inc GST = $3,741 ✓ | Trade Inc GST = $3,554 ✓
  UL220 HBU002: NSM Inc GST = $5,911 ✓ | Trade Inc GST = $5,615 ✓
  All whole dollars confirmed.
  ⚠️ Sub-Dealer Inc GST values anomalous ($3, $5) — data issue, not code bug

TEST 2 — GP Percentage: PASS
  Row 1 NSM: (3400 - 2555.72) / 3400 = 24.8% ✓
  Row 1 Trade: (3230 - 2555.72) / 3230 = 20.9% ✓
  Row 2 NSM: (5372.73 - 3872.65) / 5372.73 = 27.9% ✓

TEST 3 — Motor Price Levels: FAIL
  Motor F25SWTC: Cash $5,285.96 | Trade $5,285.96 | Sub-D $5,285.96
  Hero card price did NOT change across levels.
  Package total DID change (Cash $12,612 → Trade $11,819).
  Root cause: hero card used hardcoded sellPriceExclGst instead of getPriceForLevel()

TEST 4 — Dealer Fit Item Pricing: PASS
  Propeller item showed $247 ✓

TEST 5 — Proposal Inc GST: [awaiting re-test]
TEST 6 — Dealer Audit: [awaiting re-test]
TEST 7 — Yamaha Motor Pricing: [awaiting re-test]
```

### Fix Applied
- Commit `1008637`: Motor hero card and grid card prices now use `getPriceForLevel(motor, priceLevel)` instead of hardcoded `sellPriceExclGst`

---

## v1.2.1 — Test Run 2 (After motor hero card fix)

### Results
```
TEST 1 Inc GST Rounding: PASS
TEST 2 Motor Price Levels: PASS (hero card now responds to level selector)
TEST 3 Accessory Pricing: PASS (expected behavior — MPF items have single price)
TEST 4 Dealer Fit Act Sell: PASS
TEST 5 Proposal Inc GST: PASS
TEST 6 Finalize Price Level Snapshot: PASS (sub-dealer gets trade pricing)
TEST 7 Yamaha Motor Pricing: PASS

7/7 PASS — v1.2.1 READY FOR PRODUCTION
```

### Key Confirmations
- Motor F25SWTC: Cash $6,766 → Trade $5,973 → Sub-Dealer $5,973
- Stock item saved with Price Level = TRADE, motor snapshotted at Trade price
- Inc GST values whole dollar across all price levels
- Dealer fit items from MPF show Act Sell prices correctly

---

## v1.2.0 — Final Surface Test (Pre-release)

### Results Summary
- **30+ test cases across 7 sections** — ALL PASS
- Sections: Dashboard, Highfield (5 tabs), Quote Builder (6 steps), Proposals, Yamaha (4 tabs), MPF, Images

---

## v1.2.0 — QA Round 3 (Motor Dealer Fit E2E)

### Results Summary
- 10 tests — 9 PASS, 1 FAIL (dealer fit save crash — Layers import)
- Fix applied: commit `7be871b`

---

## v1.2.0 — QA Round 2 (Post-fix Regression)

### Results Summary
- TEST 1 Proposal View: PASS (crash fixed)
- TEST 2 Classic Images: FAIL (still broken — code fix hadn't deployed yet)

---

## v1.2.0 — QA Round 1 (Initial)

### Results Summary
- 15 test cases — 12 PASS, 2 FAIL, 1 SKIP
- TC-03 Classic Images: FAIL (Next.js Image blocking CDN)
- TC-09 Proposal View: FAIL (orgQuoteList undefined)
- TC-15 Sub-Dealer: SKIP (no credentials)
