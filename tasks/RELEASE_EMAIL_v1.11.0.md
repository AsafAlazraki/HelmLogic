# Release email — v1.11 (Fit-Up Release)

**Subject:** HelmLogic v1.11 — Fit-Up release · ready for sign-off (Mark's 8-item checklist 11/11)

**To:** Mark McWilliams, Colin Kean
**Cc:** Bill Hull, Oren Alazraki
**Attachments:** `bm-checklist.pdf` (CL380) · `bm-checklist-sport.pdf` (SP600/SP560 fallback)

---

Hi Mark / Colin,

Following up on your email Monday — HelmLogic **v1.11** is ready for sign-off and the dev branch is one click away from merging into main. The release is centred on Fit-Up, but the last 24 hours have been a pre-launch hardening pass driven by your 8-item list, so I want to walk you through it before we ship.

## Your 8 items — all green

Each item is now proven end-to-end by a Playwright spec that drives the live dev URL, picks every option, finalises the quote, and downloads the PDF. The matrix below is from the actual test output:

| # | Your ask | Result |
|---|---|---|
| 1 | Proposal formed correctly + customer name placed | ✅ All sections render in order; the customer name appears on the cover, in the body, and on the proposal-view header |
| 2 | No trailer images during hull selection | ✅ Step 1 carousel is hull-only; trailer image only joins the build from Step 4 onwards |
| 3 | All correct FFO presented | ✅ Step 2 surfaces Standard Inclusions + Factory Options + Additional Factory Notes |
| 4 | Engine + rigging options | ✅ Step 3 motor hero auto-selects closest to max HP, swappable via Choose Another Motor; Step 5 fit-up rigging tier picks add rigging items to the quote |
| 5 | Trailer options | ✅ Step 4 Trailer Base + Trailer Hardware + Additional Factory Trailer Notes |
| 6 | DFOs | ✅ Step 5 dealer-fit grouped by scope (Motor / Boat / Trailer) |
| 7 | Rego + compliance | ✅ State-aware RegoPicker on Step 1 + itemised Registration line in the PDF Investment Summary |
| 8 | Fit-out — basic / standard / complex | ✅ Step 5 SIMPLE / MEDIUM / COMPLEX tier package cards on every model |

The two attached PDFs are the actual output — **CL380** (Classic) and **SP600 / SP560** (Sport) — proving the customer-facing form is stable across ranges.

## What else changed for the PDF (your "beautiful" line)

- **Trailer image is back** — was suppressed earlier in the cycle because the catalog had vendor logos slipping through; the new fallback chain prefers the trailer photo, then the catalog cover, and only falls back to a placeholder if nothing's set
- **Motor image** — the PDF now also tries the `SummaryImage` field, so motors uploaded via the catalog UI render properly even when the Yamaha CDN blocks the source
- **Investment Summary now reads like a real itemised quote** — Standard Inclusions, Factory Options, Motor Accessories, Trailer Options, and Dealer Fit lines indent under their parent (Vessel / Propulsion / Trailer) with a smaller font + L-tick. Maths is unchanged; it's just legible now

## Auditability (your "audited" line)

Two unified views answer "who did what when" without anyone touching Firestore:

- **Activity tab** on every proposal — every lifecycle event with actor + timestamp + a one-line diff. Covers: Quote created · Finalised · Sent · Locked / Unlocked · Forked · Content personalised · Discount changed · Status updated · Scenario created · Fit-up status updated
- **Catalog Audit** on Manage → Catalog Manager → History — chronological feed of every xlsx import AND every Fit-Up item / package add / edit / delete. Click a row to see the field-level diff (rose strike-through = before; green = after)

If a price ever looks wrong on a quote, the audit answers two questions in two clicks: who set it on the catalog (Catalog Audit), and who applied it to the quote (Activity tab).

## Fit-Up Catalog editor — UX polish

The Add / Edit dialog on Manage → Fit-Up Catalog got a presentation rework — wider canvas, four labelled sections (Basics · Customer-facing · Internal · Assignment scope), tier picker as colour-coded pill row, image preview at usable size, sticky Save bar. Nothing about the data model changed; existing items still save the same way. Just doesn't look slack anymore.

## What's NOT in v1.11 (parked for v1.12)

- Service-quote flow (Epic 11.2) — the code is on dev but moves to the v1.12 headline
- Motors Table read-view (3.7.3)
- Suggestion Approval Queue (3.5.1)
- Auto-classification rule engine — the simple motor-HP heuristic stays for now; full operator-authored rules are v2.2

## How to use it (quick)

The user guide (`USER_GUIDE_v1.11.0.md`) has a § 0 happy-path walk-through that matches your 8 items step-by-step — useful for any of the dealers we're rolling this out to. If a salesperson follows it once they've used every new surface in the release.

## Next steps

- I've held off on merging dev → main pending your eyeball on the two PDFs — anything off, flag it and I'll spin a fix
- Once you say go, the merge takes minutes and the prod deploy auto-fires
- I'll send a short "v1.11 is live" follow-up after merge

Bargain Boat Bits AGM dealers will love the Fit-Up tier cards — that's the biggest visible change for them.

Cheers,
Asaf

---

_Generated alongside Pull Request [#40](https://github.com/AsafAlazraki/HelmLogic/pull/40)._
