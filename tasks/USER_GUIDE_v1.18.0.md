# v1.18 — User Guide

**Audience**: Org admins + salespeople.
**Theme**: Catalog polish, faster everyday edits, first customer-facing surface formally flipped on.

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Pin a useful search to one click | Catalog Manager → top search box | 1. Saved filter views |
| Edit a stock row without opening a dialog | Module → Stock Management | 2. Inline-edit stock |
| Export the whole boat catalog as one CSV | Catalog Manager → top toolbar | 3. Hierarchy CSV |
| Send a customer their quote PDF via email | Proposal view → Send Quote | 4. Send Quote (boat) |

## 1. Saved filter views

**To pin a filter:**
1. Open Catalog Manager.
2. Type your filter into the "Search brands or models" box (e.g. "F70" or "Highfield CL").
3. A "Save "F70"" button appears next to the search.
4. Click it, give your pin a short name ("Yamaha F70 sweep"), Save.
5. The pin appears as a chip below the search box. Click the chip any time to re-apply. Click the X on the chip to delete it.

**What this affects**
- Pins are per-user. Your saved filters don't show up for other salespeople or admins.
- Pins are stored on your profile, so they follow you across browsers.

**Tips**
- The active chip highlights when its query matches the current search. Useful when you're flipping between two saved views.
- The Save button only shows up when the search has something in it AND that exact query isn't already pinned.

## 2. Inline-edit stock

**To edit a stock row's Stock Number, Location, or Label:**
1. Open the module → Stock Management tab.
2. Click directly on the value in the cell (not on the row itself, that opens the detail).
3. Type your edit, blur the cell or press Enter to save.

**What this affects**
- Writes go straight to the inventory record. Toast confirms.
- Status, Date Into Stock, and other structured fields still use the full detail view (different UX, that lands later if needed).
- If the table is in read-only mode (proposal view embed), cells stay plain text.

## 3. Hierarchy CSV

**To export the whole boat catalog as one flat CSV:**
1. Open Catalog Manager.
2. Click the **Export hierarchy** button next to the Catalog Audit card.
3. One CSV downloads with Brand, Range, Model Code, Model Name, Length, Beam, Tube, Max HP, Min HP, Capacity, Cost, Sell, Margin, Has Cover, Updated.
4. Filename includes the date so accounting can keep a dated archive.

**What this affects**
- Scope is boats only. Motors and trailers are flat per-vendor lists, already export cleanly from their per-table Export CSV buttons.
- The export walks every subscribed Boat Brand. If you only want one brand, filter in Excel.

## 4. Send Quote (boat)

Already shipped in v1.8 but formally tracked in v1.18 as the first customer-facing surface for boat quotes.

**To send a quote via email:**
1. Open the proposal view for the quote.
2. Click the **Send Quote** button in the top toolbar.
3. The Send Quote dialog opens, pre-filled from your org's Send Quote template. Edit recipient / CC / BCC / subject / body if needed.
4. Click Send. The system renders a fresh PDF, uploads it, fires the email, writes the audit log, increments the sentCount, sets lastSentAt, and auto-locks the quote on first send.

**Gating**
- The Send Quote button is disabled until `NEXT_PUBLIC_EMAIL_SEND_ENABLED` is set to true. Asaf flips this once stakeholder sign-off on sender domain + SendGrid lands.
- Once enabled, locked quotes stay locked (you can't edit a sent quote without explicit unlock).

## Synthesis: where v1.18 lands you

- Faster everyday catalog edits: pin a filter, edit a stock row inline, export the full hierarchy for accounting. No more "open a dialog to change one field".
- The boat-quote send flow is the first customer-facing surface that's formally part of the release schedule. The rest of Epic 8.1 (My Customers, My Quotes) lands v1.21.
- Internal scaffolding: 2.1.1 means every price level in HelmLogic now resolves through one function so future re-pricing changes ripple through cleanly. Receipt PDF branding sets up v1.20's deposit-receipt PDF.

## What v1.18 did NOT ship (deferred to v1.19+)

- Customer-facing surfaces beyond Send Quote (My Customers, My Quotes, Customer Detail Sheet) — Epic 8.1, v1.21+.
- Margin threshold enforcement — Epic 2.2.1, v1.19.
- Mobile-responsive polish — v2.2.
- NSM-Hub migration tooling — still service-account-blocked, v1.19 conditional.
- Live Shopify integration — research-only this cycle, v1.21+ kickoff target.
- Contract Signing Pack Generation — v1.20 (needs receipt PDF first).
- Quote Variations (post-contract) — v1.19.
