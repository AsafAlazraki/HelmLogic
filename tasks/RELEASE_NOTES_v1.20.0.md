# v1.20 — Quote-to-Contract lifecycle + variation surfaces

**Date**: 2026-06-25
**Branch**: `claude/app-overview-wKiZ1` → `main`
**Theme**: Take a sent + accepted quote through to a signable contract with deposits recorded. Land the variation editor + customer-accept page on top of the v1.19 schema foundation. First multi-document PDF artifact (Contract Signing Pack) consuming the v1.18 shared branding tokens.

## Release Stats

- **6 stories shipped end-to-end with browser-proof E2E tests on dev URL.**
- **2 retargets**: 8.2.1 Reporting Dashboard → v1.21, 5.2.1 RBAC → v1.22.
- **3 NSM-Hub stories** still service-account-blocked, carries to v1.21.

## Phase A — Quote-to-Contract

### 2.4.1 Convert Quote → Contract
- New `src/lib/catalog/contract.ts`. `Contract` shape, `ContractSnapshotLine`, `canTransitionContractState`, `buildContractReference`, `computeContractTotals`. `previousContractId` field supports re-conversions.
- `firestore.rules` adds `match /contracts/{contractId}` under `/users/{userId}/quotes/{quoteId}/`. Rules-deployed regression test extended.
- **UI**: Convert to Contract button on the proposal-view nav. Gated (disabled when expired, still draft, or already converted) with tooltip explaining each block. Confirm dialog summarises the quote + total. Save creates the contract doc + pins `contractId` + `contractReference` back on the quote.
- **Contract detail sheet**: opens via "View Contract" pill once `quote.contractId` is set. Shows snapshot lines, totals, deposits list, and the signing-pack button.

### 2.4.2 Deposit Recording + Receipt PDF
- New `src/lib/catalog/deposit.ts`. `Deposit` shape, `DepositPaymentMethod` ('cash' | 'eft' | 'cheque' | 'card' | 'other'), `buildReceiptReference` (`RCT-{ORG}-{YYYYMMDD}-{seq}`), `computeDepositTotals` (Math.ceil GST rule per v1.3 lesson), `PAYMENT_METHOD_LABEL` map.
- `firestore.rules` adds nested `match /deposits/{depositId}` under `/contracts/{contractId}`.
- **UI**: Record Deposit dialog (amount ex GST + inc-GST live preview, method dropdown, paid-on date, optional customer reference). Lives inside the contract detail sheet. Live deposits list with receipt ref + method + total inc GST.
- **Receipt PDF**: render hook on the deposit doc (`receiptPdfUrl` field). First-cut content placeholder; full template ships v1.21 polish.

### 1.4.4 Quote Validity / Expiry
- New `src/lib/catalog/quote-expiry.ts`. `evaluateExpiry`, `nextExpiryDate`, `formatExpiryDate`. Bands: `fresh` / `expiring-soon` (within 7d) / `expired` / `no-expiry`. Org override on `organisation.defaultQuoteValidityDays` (default 30). Timezone-aware via `organisation.timezone` (default Australia/Sydney).
- **UI**: expiry banner on proposal-view above the main content. Rose tone for expired, amber for expiring-soon, hidden otherwise. Send + Convert gates engaged when expired.

### 1.3.2 Contract Signing Pack Generation
- New `src/components/contract-signing-pack-button.tsx`. Mounts in the contract detail sheet header. Generates a multi-section PDF via `@react-pdf` with dynamic import (matches the v1.12/11.2.3 service-quote pattern). First v1.20 PDF artifact consuming the v1.18 `pdf-branding.ts` shared tokens.
- Sections: contract snapshot, accepted variations, receipts. First-cut content is structural; v1.21 polish fills in the line-by-line render.

## Phase B — Variation surfaces

### 2.3.1 Quote Variations editor + send pipeline
- Schema + helpers shipped v1.19. v1.20 lands the editor.
- New `src/components/variation-editor-dialog.tsx`. Mounts on locked quotes via a new "Variation" button on the proposal-view nav.
- Lines list with kind (add / remove / priceAdjust) + label + delta ex-GST. Live running total. Save as draft OR Send to customer. Send writes status='sent', stamps `lockedAt`, generates a one-time-use `publicAcceptToken` (32-hex random).

### 2.6.3 Customer Agreement on Variation
- New `src/app/accept-variation/[token]/page.tsx`. Public route, no login required.
- Anonymous auth + `collectionGroup('variations')` lookup by token.
- Customer signs on canvas (mouse + touch), enters name, submits. Writes `status='accepted'`, `acceptedAt`, `acceptedByName`, `acceptedSignatureDataUrl`, `acceptedUserAgent`, `publicAcceptTokenConsumed=true`.
- Surfaces every stage: loading / invalid / consumed / ready / submitting / signed / error.

## E2E proof on dev URL

Every v1.20 surface gets a browser walkthrough in `tests/v1.20-browser.spec.ts` that runs against the live dev URL. Per the v1.18 lesson — file-based assertions are the floor, browser proof is the ceiling.

Surfaces walked:
- ✅ Convert to Contract button mounts
- ✅ Convert to Contract dialog opens (or is correctly gated)
- ✅ Expiry banner hidden when no expiry set
- ✅ View Contract pill (once contract exists)
- ✅ Record Deposit dialog (from contract detail sheet)
- ✅ Variation editor (when quote is locked)
- ✅ Public accept-variation page mounts + token lookup fires

## Held / Deferred

- **8.2.1 Reporting & Analytics Dashboard** retargeted v1.20 → v1.21.
- **5.2.1 Brand & Dealer Isolation (RBAC + leakage tests)** retargeted v1.20 → v1.22.
- **11.3.1 + 11.3.2 + 11.3.3** NSM-Hub trio carries to v1.21.

## What's NOT in v1.20

- Reporting Dashboard (8.2.1, retargeted to v1.21).
- RBAC + leakage tests (5.2.1, retargeted to v1.22).
- NSM-Hub migration tooling (still blocked).
- Customer pipeline + My Customers / My Quotes (Epic 8.1, v1.21+).
- Mobile-responsive polish (v2.2).
- Live Shopify integration (v1.21+).
- Full PDF content for receipt + variation + signing pack (structural in v1.20, polished v1.21).
- Server-side accept-variation endpoint (anonymous-auth client write for v1.20 PoC; Cloud Function in v1.21).

## Files Changed

### New
- `src/lib/catalog/contract.ts`
- `src/lib/catalog/deposit.ts`
- `src/lib/catalog/quote-expiry.ts`
- `src/components/contract-detail-sheet.tsx`
- `src/components/contract-signing-pack-button.tsx`
- `src/components/record-deposit-dialog.tsx`
- `src/components/variation-editor-dialog.tsx`
- `src/app/accept-variation/[token]/page.tsx`
- `tasks/v1.20-plan.md`
- `tasks/RELEASE_NOTES_v1.20.0.md`
- `tasks/USER_GUIDE_v1.20.0.md`
- `tests/v1.20-everything.spec.ts`
- `tests/v1.20-browser.spec.ts`
- `scripts/ship-v120-features.py`

### Updated
- `src/components/proposal-view.tsx` (expiry banner + Convert/View Contract/Variation buttons + sheet mounts)
- `firestore.rules` (contracts + deposits subcollections)
- `tests/firestore-rules-deployed.spec.ts` (contracts probe)
- `src/lib/release-schedule.ts` (v1.20 flag flip)

## Required after merge

- **Publish firestore.rules to prod** for the new `/contracts` + `/deposits` paths. Re-run `tests/firestore-rules-deployed.spec.ts` to confirm.
- Run `scripts/ship-v120-features.py` to flip Phase A stories to `status: shipped` + retarget 8.2.1 → v1.21 + 5.2.1 → v1.22.
- Flip `RELEASE_WINDOWS['v1.20'].shipped = true` (already in release-schedule.ts commit).
- `FORWARD_RUNWAY_START` bump 20 → 21.
