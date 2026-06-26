# v1.20 — User Guide

**Audience**: Org admins + salespeople + GMs + customers (accept-variation public page).
**Theme**: Take a quote through to a signed contract. Record deposits. Send and accept priced variations after lock.

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| See when a quote expires | Proposal view (top banner) | 1. Quote expiry banner |
| Convert an accepted quote to a contract | Proposal view → top nav | 2. Convert to Contract |
| Record a deposit against a contract | Contract detail sheet | 3. Record Deposit |
| Generate a signing pack PDF | Contract detail sheet | 4. Signing pack |
| Create a variation after lock | Proposal view (locked quote) | 5. Create variation |
| Customer accepts a variation | Public link in email | 6. Accept variation |

## 1. Quote expiry banner

If a quote has an `expiryAt` set, the proposal view renders a banner at the top:
- **No banner**: more than 7 days remaining, or no expiry set.
- **Amber banner**: 7 days or fewer until expiry. Shows the date.
- **Rose banner**: expired. Send + Convert actions block until the quote is reissued.

Default validity is 30 days. Override per org via `organisation.defaultQuoteValidityDays` (UI for this lands v1.21).

## 2. Convert to Contract

The "Convert to Contract" button sits next to "Send Quote" in the top nav. It's enabled when:
- The quote has been sent / viewed / accepted.
- The quote isn't expired.
- The quote hasn't already been converted.

If any block applies, the button is disabled and a tooltip explains why.

**To convert:**
1. Click Convert to Contract.
2. Confirm the dialog (shows quote total inc GST + the reference format).
3. The system creates a contract doc with a fresh reference (`CON-{ORG}-{YYYYMMDD}-001`) and pins `contractId` back on the quote.
4. A new "View Contract" pill appears in the nav.

## 3. Record Deposit

Once a contract exists, click "View Contract" to open the contract detail sheet.

**To record a deposit:**
1. Click Record Deposit.
2. Enter amount ex GST (inc-GST preview shown live).
3. Pick payment method (Cash, EFT, Cheque, Card, Other).
4. Enter the paid-on date (defaults to today).
5. Optional: customer reference (EFT ref, cheque number, card last 4).
6. Click Record Deposit. A receipt reference is generated (`RCT-{ORG}-{YYYYMMDD}-{seq}`).

The deposit appears in the contract sheet's Deposits list.

## 4. Signing pack

From the contract detail sheet, click **Generate signing pack**. A PDF downloads containing:
- The contract snapshot.
- Accepted variations + customer signatures.
- Receipts for any deposits paid.

(v1.20 ships the structural PDF; full line-by-line content polish v1.21.)

## 5. Create variation

Variations are the only way to modify a quote after it's been locked (which happens automatically on first send). Click **Variation** in the proposal view top nav (only visible when the quote is locked).

**To create a variation:**
1. Enter a short title ("Add bow ladder", "Swap to chrome trim").
2. Optional: a customer message.
3. Add lines. Each line has:
   - **Kind**: Add / Remove / Price adjust.
   - **Label**: short description shown on the variation PDF.
   - **Delta ex GST**: positive for additions, negative for removals or price reductions.
4. The total delta updates live (emerald for up, rose for down).
5. **Save draft** keeps the variation editable for later.
6. **Send to customer** writes the variation as sent + generates a one-time-use accept link + (in v1.21) emails the customer.

## 6. Accept variation

Customers receive a variation email with a link to `/accept-variation/{token}`. The link is unguessable and one-time-use.

**Customer flow:**
1. Open the link.
2. Read the variation summary + delta lines.
3. Enter their name.
4. Sign in the signature box (mouse on desktop, finger on touch).
5. Click Accept variation.
6. The page confirms acceptance.

**What the dealer sees:**
- Variation status flips from `sent` to `accepted`.
- Customer name + signature + IP / user-agent captured on the variation doc.
- Signing pack regeneration picks up the accepted variation.

## Synthesis: where v1.20 lands you

- Quote → Contract → Deposits is now a real lifecycle. No more "we sort of converted this in our heads".
- Variations are a first-class concept post-lock. No more "let's edit the quote and hope no-one notices".
- The customer signs once, on a public page, and your audit trail captures it permanently.
- The signing pack is the single PDF artifact you hand the customer (and accounting) at the end.

## What v1.20 did NOT ship (deferred to v1.21+)

- Reporting & Analytics Dashboard (8.2.1, retargeted to v1.21).
- RBAC + leakage tests (5.2.1, retargeted to v1.22).
- NSM-Hub migration tooling (still service-account-blocked).
- Customer pipeline / My Customers / My Quotes (Epic 8.1, v1.21+).
- Org-level UI to edit `defaultQuoteValidityDays` and `marginThresholdPct` (Firestore edit today, admin UI v1.21).
- Receipt PDF detailed rendering + variation PDF (structural in v1.20, polish v1.21).
- Email pipeline for variation send (writes status='sent' in v1.20; outbound email layered v1.21 using the same SendGrid path as quote send).
- Server-side accept-variation endpoint (anonymous-auth client write v1.20; Cloud Function v1.21).
