# HelmLogic — User Guide v1.33.0

**Audience:** org admins + salespeople at Northside Marine.

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| See who actually uses HelmLogic — sessions, active time, every click | Reporting → Usage & Activity | 1 |
| Export a usage report as a PDF | Reporting → Usage & Activity → Export PDF | 1 |
| Remove a sent quote from your lists (and get it back) | Proposals / My Work → quote menu | 2 |
| Do the paperwork on a quote (rego numbers, warranty, trade-in, licence) | Quote flow → Step 6 ADMINISTRATION | 3 |
| Remove ONE dealer-fit option instead of clearing all | Catalog → Dealer Fit rows | 4 |
| Put a photo on a dealer-fit part (e.g. Garmin head unit) | Catalog → Dealer Fit rows → image button | 4 |
| Add your own option headings (Paint Options, Cockpit Options…) | Any brand's model editor → Factory Configurator | 5 |
| Reorder the sections of the customer PDF | Manage → Document Templates → PDF Sections | 6 |
| See rego sticker prices in the system | Rego module → Queensland Transport | 7 |
| Show a rebate on the right part of the quote | Module promotions (boat vs motor module) | 8 |
| Put Build-A-Boat on the website without exposing trade prices | Quote URL + `?priceMode=public` | 9 |

## 1. Usage & Activity reports

**Reporting** now has two tabs. **Business** is the dashboard you know. **Usage & Activity** is new: it shows who logged on, how long they were genuinely active versus idle with the tab open, and every click, page view and action — captured automatically from the moment this release went live.

**To do it:** open **Reporting → Usage & Activity**. Pick a date range (7/30/90 days), a person, an event type, or type into the search box. Click a row in **Who actually uses it** to focus that person. The event explorer at the bottom lists the raw stream.

**Test accounts:** activity from the shared test login is tagged TEST and **excluded by default** — flip the *Include test accounts* switch to see it. So "I used it and did this" claims can be checked against the record, and our own testing never pollutes the numbers.

**PDF:** the **Export PDF** button renders exactly what you have filtered — period, people, KPIs, per-person table and the event feed — as a branded document you can table in a meeting.

**What this affects:** nothing about how anyone works — capture is automatic and invisible, and it can never slow down or break the app.

## 2. Removing (and restoring) sent quotes

Removing a quote from your lists now works on **sent quotes too** — previously the lock that protects a sent quote also blocked removing it, which is why the delete appeared to do nothing. Removal is a soft archive: the quote and its full audit history stay intact and it can be restored. Locked quotes still refuse every content edit.

## 3. The ADMINISTRATION step (quote flow)

The quote flow is now **7 steps**: Boat Base → Factory Options → Motor → Trailer → Dealer Fit → **Administration** → Summary.

**Administration** gathers the paperwork in one place:
- **Registration** — chips confirm what's included (boat rego, stickers, tender-to decal, trailer rego; prices are set on the Boat Base / Trailer steps), plus fields for the **assigned rego numbers** once you have them.
- **Dealer Services** — the NSM 6 Year Extended Warranty and the Direct Debit Service Plan toggles (moved here from the Motor step).
- **Admin & Trade-In** — trade-in description and agreed value, insurance quote request, finance quote request, estimated delivery date and timing notes (moved here from the Summary step).
- **Driver's Licence** — upload a photo or PDF of the customer's licence; it's attached to the quote at finalize.

**Tips:** deposit isn't here on purpose — the deposit schedule comes from Manage → Document Defaults at finalize time.

## 4. Dealer-fit options: single remove + images

On **Catalog → Dealer Fit**, every selection row now has its own **remove** (trash) button — no more clearing a whole category to drop one item. Next to it, an **image** button lets you upload a photo for the part (the Garmin head-unit case: many MPF rows have no picture). The photo shows on the catalog row and on the option's card in the quote flow.

## 5. Factory Configurator for every brand

The **Factory Configurator** (where you create option categories like *Paint Options* or *Cockpit Options* and the options inside them) now appears in the model editor for **every brand** — Stacer, Stabicraft, Surtees and Jeanneau included, not just Highfield. Type a category name into **CREATE CATEGORY…**, hit CREATE, then fill in the options. The headings appear on the quote flow's Factory Options step exactly like Highfield's do.

## 6. PDF sections: drag anywhere on the row

In **Manage → Document Templates → PDF Sections**, you can now grab a section **anywhere on the row** to drag it — not just the tiny grip icon (which is why it felt locked). The four system sections (Cover, Vessel Configuration, Pricing, Signatures) remain anchored by design; everything else reorders and the customer PDF follows.

## 7. Rego sticker pricing

The **Rego module** (Queensland Transport) now carries sticker pricing with both sell and cost so margin is visible: Custom stickers $150 (cost $90), Standard White $60 ($25), Standard Black $60 ($25), Tender-To $180 ($110). Admins can add or edit sticker rows like any rego type — there's a new *Sticker* kind in the Applies To picker and a Cost field in the form.

## 8. Rebates show on the right section

Factory promotions now appear on the step they belong to: **hull/boat rebates on Step 1** (Boat Base) and **motor rebates on Step 3** (Motor). Where a promotion shows is driven by which module it was created on — a promotion on the Highfield module is a hull rebate; one on the Yamaha module is a motor rebate. Ticked promotions still discount the total exactly as before.

## 9. Build-A-Boat on the website (prices locked)

To embed the quote flow publicly (the "build a boat" idea for the NSM website), append **`?priceMode=public`** to the quote URL. The price level is locked to **Cash** and the price-level picker disappears entirely — trade, sub-dealer and other internal levels can never be exposed to the public.

## How the usage telemetry works

Every app-open starts a session. While the tab is visible and you're touching the keyboard/mouse, time accrues as **active**; visible but untouched accrues as **idle (tab open)**; a hidden tab accrues nothing. Clicks on buttons/links/tabs, page navigations and key actions are captured with labels, batched, and written every 15 seconds. All of it is org-scoped, admins are the only ones who can delete history, and a telemetry failure can never affect the app itself.

## What this release did NOT ship (deferred)

- **Splitting Highfield models per console** (340 / 340 FCT / 340 GT as separate models) — awaiting a product ruling; it restructures 85 models.
- **NSM-Hub service-quoting migration** — still blocked on the service account.
- **The new dedicated test login** — Bill's account keeps the TEST tag until the new login lands; history keeps its stamps either way.
- **Display-Sheet nightly parity for every boat + override drift alarm** — next cycle; the SP560 proof re-ran green on this release ($103,731 exact).
