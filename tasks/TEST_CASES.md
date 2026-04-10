# HelmLogic — Test Cases Archive

> Every test case prompt sent to cowork, with corresponding results.

---

## TC-v1.2.1-R2: Motor Price Level Re-Test

**Sent**: After commit `1008637`
**Purpose**: Verify motor hero card/grid card prices respond to price level selector

### Prompt
```
Start a Highfield quote (e.g., Classic → CL340)
Go to Step 3 (Motor)
Note price level selector — default "Cash Price" or "Published Price"
BEFORE selecting a motor: look at grid card prices. Note price for one motor.
Change price level to "Trade Price"
Expected on grid cards: Motor prices should CHANGE to Trade Price values (lower)
Select a motor — hero card appears
Expected on hero card: Price matches Trade Price, NOT Cash Price
Switch to "Sub-Dealer Price" — should match Trade Price
Switch back to "Cash Price" — price returns to higher retail/NSM price
Click "Choose Another Motor" → grid reappears with prices at current level
```

### Result
```
[AWAITING]
```

---

## TC-v1.2.1-R1: Full Pricing Precision Test Suite

**Sent**: After commit `f250f58`
**Purpose**: Test all v1.2.1 pricing changes

### Prompt
```
TEST 1: Pricing Workspace — Inc GST Rounding
  Highfield → Pricing → find row with price level set
  Check INCL GST column = whole dollar amount
  Check component Inc GST values (Sea Freight, Handling) = whole dollars
  Check across Cash, Trade, Sub-Dealer levels

TEST 2: GP Percentage
  GP% = (Sell Ex GST - Landed Cost) / Sell Ex GST * 100
  Should be consistent with Ex GST (unaffected by rounding)

TEST 3: Motor Price Levels in Quote Builder
  Start quote, Step 3, select motor, note Cash price
  Switch to Trade Price — hero card price should change
  Switch to Sub-Dealer — should show Trade Price

TEST 4: Dealer Fit Item Pricing
  Step 5, check dealer fit item card prices
  Should come from Act Sell field, not $0

TEST 5: Proposal Inc GST — Whole Dollar Rounding
  Finalize quote, view proposal
  Total Inc GST = whole dollar (rounded up)

TEST 6: Stock Detail — Dealer Audit Section
  Stock item from quote → detail panel → right column
  Dealer Audit: Price Level, Quote #, Created By, Discount, financials

TEST 7: Yamaha Motor Catalog Pricing
  Yamaha → Catalog → click motor → price badge shows real price
```

### Result
```
TEST 1 — Pricing Inc GST Rounding: PASS
  UL220 HBU001: NSM Inc GST = $3,741 ✓ | Trade Inc GST = $3,554 ✓
  UL220 HBU002: NSM Inc GST = $5,911 ✓ | Trade Inc GST = $5,615 ✓
  ⚠️ Sub-Dealer values anomalous ($3, $5) — data issue not code

TEST 2 — GP Percentage: PASS
  Row 1 NSM: 24.8% ✓ | Trade: 20.9% ✓
  Row 2 NSM: 27.9% ✓ | Trade: 24.1% ✓

TEST 3 — Motor Price Levels: FAIL
  F25SWTC: Cash $5,285.96 | Trade $5,285.96 | Sub-D $5,285.96
  Hero card price UNCHANGED across levels
  Fix: commit 1008637 (getPriceForLevel on hero/grid cards)

TEST 4 — Dealer Fit Item Pricing: PASS
  Propeller item = $247 ✓

TEST 5 — [not reached due to TEST 3 failure]
TEST 6 — [not reached]
TEST 7 — [not reached]
```

---

## TC-v1.2.0-R4: Pre-Release Full Surface Test

**Sent**: After commit `5e5679f`
**Purpose**: Final sweep of every UI surface before production push

### Prompt
```
SECTION A — Dashboard & Navigation (A1-A2)
SECTION B — Highfield Module 5 tabs (B1-B6)
SECTION C — Quote Builder 6 steps + finalize (C1-C9)
SECTION D — Proposal View (D1)
SECTION E — Yamaha Module 4 tabs (E1-E4)
SECTION F — Master Price File (F1)
SECTION G — Image Verification (G1-G2)
```

### Result
```
ALL 30+ TESTS: PASS
No crashes, no broken images, all surfaces rendering correctly.
```

---

## TC-v1.2.0-R3: Motor Dealer Fit E2E Test

**Sent**: After commit `f46502c`
**Purpose**: Test dealer fit creation via Master Data Browser + quote flow integration

### Prompt
```
TEST 1: Yamaha Settings Tab
TEST 2: Motor Card Names
TEST 3: Configure Motor Dealer Fit Categories on Highfield
TEST 4: Associate MPF Vendor with Highfield
TEST 5: Create Motor Dealer Fit Selections via Master Data Browser
TEST 6: Motor Selection UX in Quote Builder
TEST 7: Prop Comes Standard Toggle
TEST 8: E2E Quote with Motor Dealer Fit
TEST 9: Classic Range Images
TEST 10: Proposal View
```

### Result
```
TEST 1 — Yamaha Settings: PASS
TEST 2 — Motor Card Names: PASS
TEST 3 — Motor DF Categories: PASS (Rigging, Propeller, General added)
TEST 4 — Associate MPF: PASS (already associated)
TEST 5 — Create Selections: FAIL (Layers is not defined crash)
  Fix: commit 7be871b (missing Layers import)
TEST 6 — Motor Selection UX: PASS (hero card, Choose Another Motor)
TEST 7 — Prop Comes Standard: PASS (toggle visible, default state observed)
TEST 8 — E2E Quote: PASS (partial — no DF selections due to TEST 5)
TEST 9 — Classic Images: PASS (A/B only, no type C)
TEST 10 — Proposal View: PASS
```

---

## TC-v1.2.0-R2: Post-Fix Regression

**Sent**: After commit `f253423`
**Purpose**: Verify proposal crash fix and catalog image fix

### Prompt
```
TEST 1: Click proposals from Dashboard — no crash
TEST 2: Classic range model cards — no broken images
```

### Result
```
TEST 1 — Proposal View: PASS
  NSM-QDE7K4N37 and NSM-QUM3UREC8 loaded successfully

TEST 2 — Classic Range Images: FAIL
  Only CL340 variants show images. 14/19 models broken.
  Root cause: code fix hadn't deployed to dev yet at time of test.
```

---

## TC-v1.2.0-R1: Initial QA Pass

**Sent**: External cowork QA agent
**Purpose**: Full v1.2 feature verification

### Prompt
```
15 test cases covering: Login, Dashboard, Module Tabs, Catalog Images,
Stock Management, Quote Builder, Console-Seat Pairing, Pricing,
Settings, Proposal View, MPF, Yamaha, Module Admin, Dealer Fit, Sub-Dealer
```

### Result
```
12 PASS / 2 FAIL / 1 SKIP

TC-03 Classic Images: FAIL (Next.js Image blocking CDN)
  Fix: commit f253423 (native <img> tags)

TC-09 Proposal View: FAIL (orgQuoteList is not defined)
  Fix: commit f253423 (removed stale variable refs)

TC-15 Sub-Dealer: SKIP (no test credentials)
```
