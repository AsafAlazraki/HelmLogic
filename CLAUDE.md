# HelmLogic — CLAUDE.md

> **NEW SESSION? Read `tasks/START_HERE.md` FIRST.**
> It gives you the full context bootstrap: release state, current work, required reading order.
> Then come back here for workflow rules.

---

## Current State (2026-06-02)

| Release | Status |
|---|---|
| v1.0 → v1.3.1 | ✅ Shipped to production |
| v1.4 Trailers + Rego | ✅ Shipped to production. See `tasks/v1.4-trailers-module-status.md` |
| v1.5 Feature Tracking | ✅ Shipped to production. See `tasks/RELEASE_NOTES_v1.5.0.md` |
| v1.5.1 Hotfix — feature overwrite | ✅ Shipped to production. PR #28 merged 2026-04-25. See `tasks/RELEASE_NOTES_v1.5.1.md` |
| v1.6 Planning System | ✅ Shipped to production. PR #29 merged 2026-04-27. See `tasks/RELEASE_NOTES_v1.6.0.md` |
| v1.6.1 Patch — shipped-release lock + v1.6 self-seed | ✅ Shipped to production. PR #30 merged 2026-04-27. See `tasks/RELEASE_NOTES_v1.6.1.md` |
| v1.6.2 Patch — v1.7→v2.2 restructure + 4 new epic backlogs | ✅ Shipped to production. See `tasks/RELEASE_NOTES_v1.6.2.md` + `tasks/v1.7-planning-restructure-status.md` |
| v1.7 Customer-PDF authoring (Content Blocks + Live Preview + Image authoring + per-Salesperson) | ✅ Ready for dev → main. Stories finalized in Firestore (`status: shipped` on all v1.7 features), `RELEASE_WINDOWS['v1.7'].shipped = true`. See `tasks/RELEASE_NOTES_v1.7.0.md` + `tasks/USER_GUIDE_v1.7.0.md`. |
| v1.8 Quote Lifecycle (Send + Lock + Audit + Personalisation + dependency hygiene) | ✅ Ready for dev → main. All planned stories shipped except 1.1.2 (Compatibility Rules) + 1.8.3 `startsOnNewPage` UI which were moved to v1.9 backlog mid-cycle (rationale in `tasks/RELEASE_NOTES_v1.8.0.md`). `RELEASE_WINDOWS['v1.8'].shipped = true`. See `tasks/RELEASE_NOTES_v1.8.0.md`. **🚨 Email send is gated by `NEXT_PUBLIC_EMAIL_SEND_ENABLED`** — flip to `true` after stakeholder approval on sender domain + SendGrid setup (see `tasks/ADMIN_TASK_email-trigger-setup.md`). |
| v1.9 Quote-lifecycle wrap-up (Compatibility Rules + Inline Preview + Lifecycle state machine + Multiple Scenarios + SharePoint) | ✅ Ready for dev → main. 4 of 5 planned stories shipped; 1.8.3 re-dropped early-Phase-A (schema dormant under v1.7 PDF architecture, 1.8.4 didn't unblock — rationale in `tasks/RELEASE_NOTES_v1.9.0.md`). `RELEASE_WINDOWS['v1.9'].shipped = true`. See `tasks/RELEASE_NOTES_v1.9.0.md` + `tasks/ADMIN_TASK_sharepoint-setup.md`. **🚨 SharePoint sync is gated by `NEXT_PUBLIC_SHAREPOINT_ENABLED`** — flip to `true` after Azure app registration + `SHAREPOINT_CLIENT_SECRET` env-var setup + per-org `sharePointConfig` doc (see admin task). Sync hooks fire on Finalize / Send / Scenario / Fork / Terminal lifecycle. |

| v1.9.5 Planning + groundwork (dealer-ops roadmap reshuffle + NSM-Hub Service Quoting groundwork + clickable release popups + emailTemplates rules hotfix) | ✅ Shipped to production. PR #36 merged. Roadmap reshuffled (157 stories re-targeted, Submitted column drained, sequential v1.10–v1.40 runway); Epic 11 Service Quoting seeded as backlog (planned, NOT built); clickable release-detail popups on the Roadmap; one-shot restructure tooling added + removed within the cycle. `RELEASE_WINDOWS['v1.9.5'].shipped = true`. See `tasks/RELEASE_NOTES_v1.9.5.md` + `tasks/USER_GUIDE_v1.9.5.md` + `tasks/nsm-hub-merge-plan.md`. **🔧 Includes a prod hotfix (CODE, not rules)** — the "Something went wrong" crash on Create Proposal was NOT a rules problem (deployed rules verified correct). `SendQuoteDialog` subscribed to `emailTemplates` unconditionally on mount + the query forced a composite index; a failure there white-screened the page via the global error boundary. Fixed by gating the subscription on dialog-open + dropping the `orderBy` (sort client-side). No rules action needed. **🚧 The actual dealer-ops + Service Quoting BUILD starts at v1.10** — v1.9.5 is planning + groundwork only. |
| v1.10 — Dealer-ops + Service Quoting foundation + prod-bug pass + Boats read-view + FirebaseErrorListener denylist | ✅ Ready for dev → main. Phase A bug pass (b516d4e): cover letter PDF, dealer-fit names, locked-discount honest-fail, stock-import dupe race. Phase B Fit-Up admin (Epic 9.1.x full): new `organisations/{orgId}/fitUpItems` collection + `Manage → Fit-Up Catalog` tab with CRUD + CSV in/out + bulk markup/retier/delete. Phase C Service Quoting catalogue (Epic 11.1.x): two new collections `organisations/{orgId}/serviceOperations` (labor codes, sell-price derives `flatRateHours × hourlyRate` unless overridden) + `organisations/{orgId}/serviceParts` (parts catalog with stock); new `Manage → Service Catalog` tab with sub-tabs. Story 3.7.2 Boats Catalogue read-view at new `/boats` page with vendor dropdown + expandable variant rows. Defensive: `FirebaseErrorListener` now has a non-essential-read denylist (fitUpItems / serviceOperations / serviceParts) so a missing rule on those paths can't white-screen the app — only the failing tab degrades to its empty state. Controlled-Tabs gating on `/manage` so the admin components only mount on tab activation. One-shot `V110RetargetButton` (now removed in close-out cleanup) flipped 9 stories to `shipped`/`v1.10`: 9.1.1–9.1.4 + 11.1.1–11.1.2 + 3.7.2 + 2 bug status-flips ("Cover letter not appearing in Proposal" + "No Names on Dealer Fit Options - Summary Quote"). `V110BumpUnbuiltButton` (also removed in cleanup) precisely retargeted v1.10 residue: 9.2.x → v1.16, awaiting-repro bugs + 11.3.1 + Trailer Catalog → v1.11, "Test level of proposals -" soft-deleted. `V195StoriesSeedButton` backfilled 6 v1.9.5 stories so its release-detail popup no longer renders empty. `RELEASE_WINDOWS['v1.10'].shipped = true`. See `tasks/RELEASE_NOTES_v1.10.0.md` + `tasks/USER_GUIDE_v1.10.0.md`. **🚧 NOT in v1.10: Epic 11.2 service-quote flow (v1.11+), Epic 11.3 NSM-Hub migration (v1.11 — needs service-account), Epic 9.2 fit-up quote-flow integration (v1.16+), Epic 9.3 auto-classification (v2.2), HL Save error + Import error (v1.11 — awaiting repros), RU200KAM $76.82 delta (v1.11), Trailer Catalog data re-import (v1.11), 3.7.8 Delivered deals dashboard placement decision (open).** |
| v1.12 — Service Quoting end-to-end (view/edit/status lifecycle + customer-facing PDF + customer schema redesign) | ✅ Ready for dev → main (joint v1.12 + v1.13 push). **Story 11.2.2** Service-quote view/edit + status lifecycle — new `ServiceQuoteDetailSheet` opens from the dashboard card click; strict state machine (`draft → sent · cancelled`, `sent → accepted · cancelled · draft`, `accepted → in-progress · cancelled`, `in-progress → complete · cancelled`, `complete`/`cancelled` lock with no outgoing transitions); audit-log entry per status change; `estimateType` selector (Installation / Insurance / Mechanical Estimate); save-on-blur edits for customer/vessel/notes; locked-quote read-only gating. **Story 11.2.3** Service-quote PDF — new `src/components/service-quote-pdf.tsx` on the `@react-pdf` pipeline; mirrors `proposal-pdf` palette (deep navy + gold rule); operations cards + parts list + notes panel + totals (operations subtotal · parts subtotal · subtotal ex GST · GST · grand total inc GST rounded up per v1.3 lesson); dynamic-imported from the detail sheet so service quotes never load `@react-pdf` until Download is clicked. **Story 3.4.1** Customer Schema Redesign — new `src/lib/customer-types.ts` shared `Customer` interface; v1.12 optional fields (`source`, `lifecycleStage`, `primaryBuyer`, `secondaryBuyer`, `tradeIn`, `documents[]`, `notesCount`); `withCustomerDefaults()` helper for read-time defaulting; existing docs migrate cleanly without a backfill; UI surface for the new fields lands in v1.14 (Story 3.4.4). **Wiring**: `ServiceQuoteDashboard` takes an optional `organisation` prop (passed from `modules/[id]/page.tsx`) so the PDF render gets org branding; service-quote cards now `onClick → setDetailQuote(q)`, status select + delete `stopPropagation` so they don't double-fire. **NOT in v1.12 (deferred to v1.14)** — 11.3.2 Migration tooling (bulk + delta-sync) still blocked on NSM-Hub `nsm-service-quotation` read service-account; design lives in `tasks/nsm-hub-merge-plan.md`. Firestore status flips applied via `scripts/ship-v112-v113-features.py`. `RELEASE_WINDOWS['v1.12'].shipped = true`. See `tasks/RELEASE_NOTES_v1.12.0.md` + `tasks/USER_GUIDE_v1.12.0.md`. |
| v1.13 — Service Quoting send + Catalogue table polish (Trailers read-view + inline editing + parity audit) | ✅ Ready for dev → main (joint v1.12 + v1.13 push). **Story 11.2.4** Send service quote via email — Send button on `ServiceQuoteDetailSheet` next to Download; pipeline renders PDF → uploads to `organisations/{orgId}/serviceQuotes/{quoteId}/sent/{sendId}.pdf` → writes `mail/{id}` for the Trigger Email extension → writes `sentEmails/{sendId}` audit → bumps `sentCount` + sets `lastSentAt` → first-send auto-lock (`lockedAt` + `lockedReason: 'sent'`) + audit-log entries for both `sent` and `locked` events; gated on `NEXT_PUBLIC_EMAIL_SEND_ENABLED` + customer email present, with tooltip explaining why disabled when off. **Story 3.7.4** Trailers Table read-view — new `src/components/trailers-table-view.tsx` mirrors `BoatsTableView` + `MotorsTableView` for `vendorType === 'Trailer Brand'`; columns Image · Code · Name · ATM · Tare · Wheels · Cost · Sell · Margin · Rego; missing-pricing rose highlight; margin band tinting (red < 15% / amber < 25% / emerald >= 25%); totals badges (priced / missing-pricing counts); rego column links to the Rego module rather than building a state-by-state column matrix (state-specific calc happens at quote time from trailer ATM); wired into `pricing-manager/page.tsx` when `activeVendor.vendorType === 'Trailer Brand'`. **Stories 3.8.1 + 3.8.2** Inline editing — new generic `src/components/inline-edit-cell.tsx` click-to-edit cell; three flavours (text / number / currency); Tab/Enter commit, Esc cancel, save on blur, tiny loader pip, inline error pill; wired into Trailers Table on name + ATM + Tare + Wheels + Cost + Sell (Boats Table + Motors Table retrofit deferred to v1.14 polish); writes go straight to `data-warehouse/{vendorId}/trailers/{trailerId}` with toast per write. **Story 3.7.5** Pricing Manager parity audit — new `tasks/PRICING_MANAGER_PARITY_AUDIT.md` inventory of 10 legacy `/pricing-manager` capabilities mapped to Catalog Manager equivalents (most wrapped, a few extended, none dropped) + 2 net-new capabilities flagged + decommission gate for Story 3.8.7. **NOT in v1.13 (deferred to v1.14)** — 11.3.3 NSM-Hub cutover + verification + decommission (same service-account block as 11.3.2). `RELEASE_WINDOWS['v1.13'].shipped = true`. `FORWARD_RUNWAY_START` bumped 12 → 14. See `tasks/RELEASE_NOTES_v1.13.0.md` + `tasks/USER_GUIDE_v1.13.0.md`. |
| v1.11 — Fit-Up release (end-to-end + expansion + variants + images + packages + scheduling + audit workbook + pre-launch hardening) | ✅ Ready for dev → main. **Phase A** — pulled Epic 9.2 forward from v1.16: `FitUpQuoteSelector` mounted on Step 5 with multi-level assignment (modules / brands / ranges / models AND-combined), motor-HP Suggested filter, customer PDF single Fit-up & Rigging summary line per locked Story 9.2.3. **Phase B (expansion)** — `FitUpItem` gains `category` + `customerDescription`; new `fitUpPackages` collection with one-click bundle selection; quote selector adds search + category chips + per-line qty / price-override / quote-note; new workshop `fitUpStatus` on the quote (pending/scheduled/in-progress/complete) as a popover pill on the proposal-view header, audit-logged. **Phase C (expansion-2)** — demo-unblocker `V111SeedFitUpDummyDataButton` (15 items + 3 packages, catalogue-wide, click-once); variant-level (sub-model SKU) assignment with lazy-loaded `variantIds` chips; item images (`imageUrl` field + native `<img>` thumbnails per CLAUDE.md lesson); soft `oftenPairedWith` hints (lightweight take on 9.3.1; full rule engine still v2.2); catalog audit log at `organisations/{orgId}/fitUpCatalogAudit` (create/update/delete with shallow diff, fire-and-forget); `FitUpPackage.packagePrice` package-level override (proportionally distributed across members as per-line overrides at quote time, margin stays honest); fit-up scheduling fields on the quote (`fitUpScheduledDate` + `fitUpAssignedTechnician`) rendered inside the workshop-status popover; expanded `catalog-export-import.tsx` as the **Pricing + Configurator Audit Workbook** with new export-only sheets (Exchange Rates / Dealer Fit Selections / Dealer Fit Categories / Motor Vendors / Motor Models with flat hull_cash / hull_trade / hull_subdealer / hull_commercial / hull_boating_alliance price-level columns). **Phase D — pre-launch hardening (8/06/2026)** triggered by Mark McWilliams' "accurate · audited · beautiful" email. (1) Mark's 8-item checklist proven end-to-end via `tests/bm-email-checklist.spec.ts` (CL380, 11/11 ticks) + `tests/bm-email-checklist-sport.spec.ts` (SP600 fallback SP560) — proposal sections + customer name placement + no-trailer-on-hull + FFO + motor + rigging + trailer + DFOs + rego (Step 1 picker + PDF) + fit-out tiers. (2) `proposal-pdf.tsx` restores trailer image (fallback chain: imageUrl → catalog.imageUrl → catalog.coverImageUrl → BuildBand placeholder), adds SummaryImage fallback for motor image, and nests Standard Inclusions / Factory Options / Motor Accessories / Trailer Options / Dealer Fit as indented sub-items under their parent Vessel / Propulsion / Trailer line in the Investment Summary. (3) Audit-trail unification — `CatalogAuditHistory` now merges `catalogAudit` + `fitUpCatalogAudit` into one chronological feed (Wrench icon for fit-up rows), and the CSV bulk-import path in `fit-up-catalog-manager.tsx` writes its missing summary audit event. New `tests/v1.11-audit-trail.spec.ts` covers the unified panel + Fit-Up edit affordance + proposal-view Activity tab. (4) Fit-Up Catalog Add/Edit dialog polish — widened to `max-w-3xl` with vertical scroll + sticky save bar, four card sections with coloured dot headers (Basics / Customer-facing / Internal / Assignment scope), tier picker as 3-button pill row in TIER_TONE colours, image preview promoted from 64×64 to 80×112 alongside its URL input. Pure JSX rework — no schema or save-logic change. (5) Proposal-PDF polish — `proposal-pdf.tsx` restores trailer image (fallback chain `imageUrl → catalog.imageUrl → catalog.coverImageUrl → BuildBand placeholder`), adds `SummaryImage` motor fallback (for the Yamaha CDN Incapsula workaround), and nests Standard Inclusions / Factory Options / Motor Accessories / Trailer Options / Dealer Fit as indented sub-items under their parent Vessel / Propulsion / Trailer line in the Investment Summary. **Other v1.11 work** documented in release notes / user guide / email: Catalog Manager rename (Pricing → Catalog, sidebar URL unchanged); "Your Build" card-stack PDF redesign with numbered BuildBand stack + scope-routed dealer-fit; per-block content-block PDF styling (`accentColor` / `backgroundColor` / `textColor` / `titleSize` / `bodySize` / `titleAlign` / `bodyAlign` / `titleItalic` schema + scope-chain resolver); motor photo upload UI mirroring to Firebase Storage; Boats + Motors catalogue read-views (Stories 3.7.2 + 3.7.3); Customer Defaults card (sources / pipeline stages / trade-in rule); Document Defaults card (deposit / payment schedule / validity); `can_override_margin` + `can_approve_suggestions` permission flags; per-scope tier-package resolver with specificity weighting (model 8 > range 4 > brand 2 > module 1, +16 for useCase); image-preload routing through weserv with `WESERV_SKIP_HOSTS` denylist (kills the 21 MB PDF regression). **NOT in v1.11 (pushed to v1.12)** — code IS on dev and will ship, planning rows moved: Service Quote Flow (11.2.1), Service Catalog refinements (11.1.3 / 11.1.4), Motors Table read-view (3.7.3), Suggestion Approval Queue (3.5.1). One-shot buttons `V111FitUpRetargetButton` + `V111ExpansionRetargetButton` + `V111SeedFitUpDummyDataButton` mounted on the Roadmap; rules redeploy needed for new paths (`fitUpPackages`, `fitUpCatalogAudit` — full ruleset in PR description). `RELEASE_WINDOWS['v1.11'].shipped = true`. See `tasks/RELEASE_NOTES_v1.11.0.md` + `tasks/USER_GUIDE_v1.11.0.md`. |

**Active dev branch**: `claude/app-overview-wKiZ1` (auto-deploys to dev URL)

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Explain changes: high-level summary at each step
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

- **Plan First**: Write plan to tasks/todo.md with checkable items
- **Plan Check**: In before starting implementation
- **Track Progress**: Mark items complete as you go
- **Verify Plan**: High-level summary at each step
- **Document Results**: Add review section to tasks/todo.md
- **Capture Lessons**: Update tasks/lessons.md after corrections
- **On Every Release (dev or main)**: Update `.agents/evolution.md` with new patterns/lessons learned, update `tasks/SESSION_HANDOVER.md` with any new Firestore collections, component changes, or architectural decisions, AND author `tasks/USER_GUIDE_vX.Y.Z.md` for the new operator-facing surfaces. The user guide is the companion to the release notes — release notes describe what changed for engineering; the user guide describes how a salesperson or org admin uses the new features.
- **Release Notes Format**: Every `RELEASE_NOTES_vX.Y.Z.md` file must follow the same layout — title, date/branch header, Release Stats, feature sections with sub-sections, Files Changed at the end. **NO release checklists** — release notes describe what shipped, not what's pending.
- **User Guide Format**: Every `USER_GUIDE_vX.Y.Z.md` file must follow the v1.7 template — title + audience line, at-a-glance map (table linking "what you want to do" → "where" → "section"), numbered sections per feature with "To do X" / "What this affects" / "Tips" sub-sections, a synthesis section ("How X works"), and a "What this release did NOT ship (deferred to vX.Y+1)" closer. Audience: org admins + salespeople. Tone: practical operator instructions, not engineering changelog. Same PR as the release. Historical guides: `USER_GUIDE_v1.7.0.md` (shipped with release), `USER_GUIDE_v1.8.0.md` (backfilled mid-v1.9 PR after the omission was caught), `USER_GUIDE_v1.9.0.md` (shipped with release).
- **🚨 Release notes AND user guide MUST ship in the same PR as the release** — `tasks/RELEASE_NOTES_vX.Y.Z.md` + `tasks/USER_GUIDE_vX.Y.Z.md` are both required to be present on the dev branch *before* opening the dev → main PR. The in-app `/feature-tracking` Release Notes tab is rendered server-side from the release-notes markdown at build time, so a release that merges without its release notes will go to prod with the historical timeline showing every prior version EXCEPT the one we just shipped. The user guide isn't rendered in-app (today) but lives in the repo for stakeholder reference + future onboarding. Pre-merge checklist for any release PR: (1) `RELEASE_NOTES_vX.Y.Z.md` exists in `tasks/`, (2) `USER_GUIDE_vX.Y.Z.md` exists in `tasks/`, (3) CLAUDE.md release-state table flips that version to ✅ Shipped, (4) `tasks/vX.Y-*-status.md` Phase line records the merge intent. If you catch yourself writing release notes or the user guide *after* the merge, open a tiny follow-up docs PR immediately.

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Only touch what's necessary. No side effects with new bugs.

---

## HelmLogic-Specific Context

### Tech Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Firebase (Firestore, Auth, Storage) via custom hooks
- Deployed via Firebase App Hosting

### Firestore Data Hierarchy
```
data-warehouse/{vendorId}/
  ranges/{rangeId}/
    models/{modelId}/
      variants/{variantId}     ← SKU-level (material + color + price)
modules/{moduleId}             ← Org access point to a vendor
  moduleDealerFitCategories[]  ← Boat dealer fit category names
  motorDealerFitCategories[]   ← Motor dealer fit category names (on BOAT module, not motor module)
  modules/{moduleId}/promotions/{promoId}  ← Per-module promotions
organisations/{orgId}/
  modelOverrides/{modelId}     ← Org-specific pricing overrides
  dealerFitSelections/
  exchangeRates/{currencyCode}
users/{userId}/quotes/{quoteId}
```

### Highfield Boat Structure
- **Vendor ID**: `LafOLpLb6QIFE856TiD4` (slug: `highfield`, vendorType: `Boat Brand`, currency: `USD`)
- **Range IDs** (under vendor `LafOLpLb6QIFE856TiD4`):
  - Classic: `qo7IePnRzJxjrYyLWhTn` | Roll-Up: `EqcKQ51svI1I2Q5poFdl` | Ultra-Light: `QsGZuVwutEr5yyMkp97j`
  - Sport: `nQ2LE50z9Tbf2uss0Ote` | Adventure: `sEzdrM2fZsrOKA3ACrJp` | Patrol: `vfXxDuMpChteKncb7LnG` | Coaster: `coaster`
- **Module ID**: `M1Yf3R9igpJDxJnOVr6f` (Highfield Boats module, linked to vendor `LafOLpLb6QIFE856TiD4`)
- **Northside Marine org**: `AcFZVEFA5UDJG2hyetWT`
- **Range** = model series/code prefix (e.g., `CL` = Classic, `SP` = Sport, `RU` = Roll-Up, `AL` = Adventure, `PA` = Patrol)
- **Model** = specific boat (e.g., `CL260`) — holds specs, optional features, trailer config, registration costs
- **Variant** = SKU (e.g., CL260-GREY-HYP) — one per material × color combo, each has `sellPriceExclGst`
- Optional features with `applicableVariantIds` restrict which SKUs can use a given feature
- Motor compatibility driven by `specifications.motorConfigurations[0].engines[0].minHp/maxHp` + `steeringType`
- Model documents do NOT have an `order` field — do NOT use `orderBy('order')` on model/variant queries; use `collection()` without ordering instead

### Seed Scripts
- `scripts/seed-highfield.py` — original script (writes to wrong vendor path `data-warehouse/highfield`, do not use)
- `scripts/reseed-correct-vendor.py` — correct script targeting vendor `LafOLpLb6QIFE856TiD4`
- Data files: `/tmp/highfield_structured.json`, `/tmp/highfield_equipment_map.json`

### Pricing Rules
- All prices stored as `sellPriceExclGst` (exclusive of GST)
- Highfield factory prices are in USD — use org exchange rate (`/organisations/{orgId}/exchangeRates/USD`) to convert to AUD sell price
- GST (10%) applied at finalization only
- `cost` field stores buy price for margin tracking

### Key Branch
- **Development branch: `claude/app-overview-wKiZ1`** — this is the ONLY active dev branch.
- Always push here. Do not push to, create, or re-invent a branch called `Dev` / `dev` / `develop` — an old `origin/Dev` exists but is stale and must not be used.
- Before any `git push`: confirm `git rev-parse --abbrev-ref HEAD` is `claude/app-overview-wKiZ1`. If you're on a different local branch for any reason, use `git push origin <local>:claude/app-overview-wKiZ1` — never invent a new remote branch name.
- If a session handover or older doc refers to "branch Dev", treat that as a stale artifact — the canonical branch is still `claude/app-overview-wKiZ1`.

### Known Lessons
- **Verify data is actually visible before telling user it's there** — always query Firestore to confirm docs exist at the correct path
- **When asking the user to deploy `firestore.rules`, ALWAYS paste the complete current ruleset** (top of file to bottom) — never just the diff or just the new helper. The user copies the entire block straight into Firebase Console → Rules → Publish; a partial paste destroys every other rule. Read the full file with the Read tool, then output it verbatim in a fenced block.
- **After every rules deploy, spot-check the deployed text in Firebase Console before saying "rules published" is done** — v1.9 prod regression (`organisations/{orgId}/emailTemplates` `list` denied for Bill Hull) traced to a partial paste somewhere earlier in the cycle. The repo file was correct; the deployed text had dropped `match /emailTemplates/{templateId}`, `match /auditLog/{eventId}`, and others. Open the rules editor AFTER publishing and confirm by eye that these critical paths exist: `emailTemplates`, `auditLog`, `sentEmails`, `contentBlocks`, `contentOverrides`, `compatibilityRules`, `sharePointConfig`, `pdfStructure`, `salesTeam`. Missing any = republish the full file. Better defense-in-depth than trusting select-all-paste-publish to be atomic.
- **`orderBy('field')` in Firestore silently excludes docs without that field** — seeded docs often don't have `order`; use unordered collection queries
- **Vendor ID matters**: app reads from `data-warehouse/LafOLpLb6QIFE856TiD4`, not `data-warehouse/highfield`
- **Module page passes vendorId + rangeId to model editors** — always pass both props to `HighfieldModelEditor` (and others)
- **Motor dealer fit categories belong on the boat module** — `motorDealerFitCategories` field on `modules/{moduleId}`, not on the motor module. Dealer fit is configured in the context of the boat being quoted
- **DealerFitOptions merges THREE category sources** — global (`dealerFitCategories` collection) + module-level (`moduleDealerFitCategories`) + motor-level (`motorDealerFitCategories`)
- **`propComesStandard` is opt-in, default OFF** — do NOT auto-enable. User explicitly toggles when the motor prop is included
- **Next.js `<Image>` breaks external CDN images** — Cloudflare anti-hotlinking blocks the optimization proxy. Always use native `<img>` for external URLs
- **After refactoring, search for ALL old variable references** — stale refs cause ReferenceErrors at runtime (e.g., `orgQuoteList` after rename)
- **`ProposalPDFDocument` needs `financials` prop** — use `buildQuoteFinancials()` from `src/lib/quote-financials.ts`
- **Non-catalog modules have `mainVendorId: null`** — always check before creating Firestore doc refs
- **Always verify Lucide icon imports** — using an icon in JSX without importing it causes a ReferenceError at runtime (e.g., `Layers is not defined`). Search for the icon name in the import line before using it.
- **Don't hardcode Select options that overlap with props** — if a dropdown receives `initialCategory` as a prop, don't also hardcode the same values as SelectItems (causes duplicate display bugs)
- **Inc GST must be rounded UP to whole dollars** — use `Math.ceil(exGst * gstMultiplier)`. Applied per item row in pricing workspace and on totals in proposals/PDFs.
- **Motor pricing uses priceLevels object** — built from Yamaha columns: hull_cash→NSM Retail, hull_trade/hull_subdealer→Trade Price, hull_commercial→Commercial Price, hull_boating_alliance→Boating Alliance Price
- **Price display must use getPriceForLevel(), never hardcoded sellPriceExclGst** — applies to hero cards, grid cards, accessories, dealer fit. Hardcoded prices don't respond to price level selector.
- **Dealer fit items use Act Sell for pricing** — MPF data uses 'Act Sell' (actual sell) and 'Act CTD' (actual cost to dealer) as the primary price/cost fields
- **Finalize payload must resolve prices through the selected price level** — use resolvePrice() not raw sellPriceExclGst, otherwise sub-dealer quotes snapshot retail prices instead of trade prices
- **Firestore `where('field', 'in', arr)` capped at 30 elements** — always `.slice(0, 30)` arrays of org IDs / sub-dealer IDs / variant IDs before querying
- **Optional chaining must extend to property access** — `obj?.x > 0` followed by `obj.x.toLocaleString()` will crash if obj is null. Be consistent: `obj?.x?.toLocaleString() ?? '0'`
- **Catalog list views must merge modelOverrides** — ModelsGrid (and similar list components) reading from `data-warehouse/.../models` must also merge `organisations/{orgId}/modelOverrides` so saved org-level changes (cover images, etc.) appear immediately
- **Multi-engine HP parsing** — Yamaha HP Rating field "2 × 300" must extract per-engine HP (300), not raw `parseFloat()` (which returns 2). Use `getMotorHp()` helper.
- **Currency display** — `formatCurrency` auto-detects whole-dollar values and omits decimals (e.g., `$39,815` not `$39,815.00`). Fractional values still show 2 decimals.
- **Parallel agents on the same file overwrite each other** — when multiple sub-agents need to edit a large component file (e.g., `highfield-quote-flow.tsx`), run them sequentially. Stash conflicts cause silent loss of work.
- **Playwright tab selectors** — use `getByRole('tab', { name: '...' })` not `text=Dashboard`. Sidebar nav links share the same text and are hidden, causing timeouts.
- **Playwright `networkidle` doesn't work with Firebase** — websockets keep the network "active" forever. Use `waitForLoadState('domcontentloaded')` plus explicit `waitForSelector(...)` calls.
- **`form.handleSubmit(onSubmit)` swallows validation errors silently** — always pass a second `onError` handler. Even better: in this app, the second handler should attempt the save anyway via `onSubmit(form.getValues())` so legacy data can never block a save. Validation is a safety net, not a gatekeeper.
- **Schemas for legacy Firestore data must be fully permissive** — every nested field `optional().nullable().default()`, every object `.passthrough()`. Saved docs predate current schema versions and WILL have missing/null fields. Strict enums on legacy fields cause silent save failures.
- **shadcn `<Input type="file">` + `<label>` doesn't fire** — the Input wrapper div breaks the label-for-input binding. Use a native `<input type="file" hidden>` and trigger it via `Button onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement)?.click()}`. Also reset `e.target.value = ''` after upload so the same file can be re-selected.
- **Refresh must restore page state** — `activeTab`, `view`, `selectedRangeId`, `selectedModelId` and similar UI state must sync to URL search params via `window.history.replaceState` so a browser refresh lands the user back where they were. Read state from `window.location.search` in the `useState` initialiser.
- **Loading overlays MUST be scoped to the view that actually consumes the data** — never `{isLoading && <Overlay/>}` at the page root. A global loading flag tied to URL-restored state will block the UI in views that don't even need that data. Use `{view === 'bmt' && (modelLoading || overrideLoading) && <Overlay/>}`. This caused v1.3.1 prod hotfix — refresh with `?model=X` loaded model data while view was still 'ranges', overlay blocked entire page.
- **URL persistence must handle PARTIAL param combos** — when you strip "default" values from the URL (e.g. delete `view=ranges`), a refresh produces a subset of the original params. If `selectedModelId` is in URL but `view` was stripped, state rehydrates inconsistently. Rules: (1) on `useState` init, INFER missing values from the deeper params present — `?model=X` implies `view='bmt'`, `?range=X` implies `view='models'`. (2) Never gate critical rendering decisions on a single URL param in isolation.
- **Every URL-synced state needs a refresh-regression test for every param combo** — not just "refresh after happy path". Test: refresh with no params, each param alone, pairs, triples. A test that only covers the case where all params are present will miss the bug where the user refreshes mid-transition and only half the params are there.
- **The canonical dev branch is `claude/app-overview-wKiZ1` — never push to a different branch name** — an old `origin/Dev` exists on the remote but is stale; pushing there (or creating a local `Dev` branch that tracks it) silently forks history and forces a rebase rescue later. Before every push run `git rev-parse --abbrev-ref HEAD` and confirm the name. If the local branch name doesn't match the remote, use the explicit refspec form `git push origin <local>:claude/app-overview-wKiZ1` — do not let a new remote branch get auto-created.
- **Don't commit vendor source spreadsheets (`.xlsx`, `.xls`) to the repo** — source data exists to be imported into Firestore by a seed script, and once imported the canonical copy is the database. The spreadsheet becomes dead weight: it bloats the repo, tempts Git LFS (6.6 MB Trailer Module xlsx is what kicked this off), and blocks pushes whenever the LFS backend is flaky. Pattern: keep the xlsx out of git, write a FINDINGS.md beside the seed script capturing schema decisions, and let Firestore be the source of truth. `tasks/*-source/*.xlsx` is gitignored for this reason.
- **Git LFS smudge failures block rebase and checkout, not just clone** — when the LFS backend returns 502 (as it did during the April 2026 branch rescue), any checkout that would materialize an LFS-tracked file fails — including the intermediate checkouts git performs during `rebase`. Workaround: `git config --local filter.lfs.smudge "git-lfs smudge --skip -- %f"` + `filter.lfs.process "git-lfs filter-process --skip"` before the rebase, then restore after. But the real fix is rule above — don't commit the source file in the first place. If a dead LFS commit is already in history and blocking a push, drop it with `git rebase --onto <commit>^ <commit> <branch>` (the LFS object stays on the remote, but nothing in the new history references it).
- **Imports must upsert by natural key, never clear-and-replace** (v1.4 remediation) — every data-import surface (Yamaha MPF, Sam Allen, delivered-deals, stock, trailer pricing) detects a key column from a priority list (Part Number → Model Code → Model ID → SKU → Code → ID → Model → Model Name → first column) and patches existing rows / creates new ones / leaves untouched rows alone. Clear-and-replace destroys operator edits on every partial upload. Always toast `N updated · M created · K skipped (no key)`.
- **Aggregate flat-list loaders use `getDocs`, not `useCollection`** (v1.4 remediation) — when the vendor/brand set is dynamic (trailer dashboard aggregates across every selected trailer brand), calling `useCollection` per vendor violates React's rules-of-hooks. Use a single `useEffect` that calls `getDocs` per vendor on mount + on a stable `vendorKey` (`vendors.map(v => v.id).sort().join('|')`). Trade live subscription for the correctness of a dynamic list.
- **Pick-time snapshots must include every field the downstream renderer needs** (v1.4 remediation) — the finalize payload can silently drop snapshot fields without any TypeScript error, breaking PDF rendering. When extending a `TrailerSnapshot` / `MotorSnapshot` OR a proposal/PDF component, check BOTH ends of the pipeline. The v1.4 trailer review caught `cost` dropped at finalize and `specifications` never added to `quote.trailer.catalog` → specs invisible on PDF.
- **Jurisdictional data comes from authoritative catalogs, not import hints** (v1.4 remediation) — rego, tax, registration, anything state-specific must be driven by a deliberate catalog system (v1.4 Rego module) with a named-legacy fallback (e.g. `model.registration.trailerPrice12Months`). Import-time hints on catalog docs (`pricingDetail.regoTypeHint`, `regoDollarsHint`) are operator notes, NOT state-aware pricing — auto-applying them would cross-state silently. Label them "info only" in the UI and leave an in-code comment at the render site explaining why they don't feed the quote flow.
- **Admin-gating flows through prop threading, not top-level branching** (v1.4 remediation) — pass `isAdmin` down through the component tree and gate at the deepest point (`TrailersWorkspace` → `TrailerDashboard` → `TrailerDetailSheet` → `TrailerImageEditor` / `TrailerEditForm`). Branching at the top of a big component produces two near-duplicate trees that drift over time.
- **Drag-and-drop cards need fractional indices, not array rewrites** (v1.5) — on drop, set the card's `order` to the midpoint between its new neighbours (or ±10 at an edge). Re-numbering the whole column on every move burns Firestore writes, races badly with concurrent drags, and still visually snaps because the local write hasn't landed yet. Pair this with a board-level optimistic override map (`Record<id, { status, order }>`) so the card shows in its new position immediately and the entry is cleared when the live snapshot catches up (or rolled back on write failure).
- **Drag + click on the same card surface need an activation distance** (v1.5) — `@dnd-kit` `PointerSensor({ activationConstraint: { distance: 5 } })` means a click opens the detail sheet and a 5px move starts a drag. Cleaner than trying to separate "drag handle" and "click target" into two different regions. Inner interactive elements (vote buttons, etc.) must `e.stopPropagation()` on `onPointerDown` so they don't accidentally initialise a drag when clicked.
- **Client-side Firestore doc IDs unlock pre-save uploads** (v1.5) — `doc(collection(firestore, 'features')).id` generates a valid ID on the client, letting the image uploader write to `features/{featureId}/` in Storage before the feature doc exists. Pattern applies anywhere an attachment needs a parent path before a parent doc is persisted.
- **Per-column sort must disable drag in non-manual modes** (v1.5) — if the visible sort is "votes" or "date" and the user drops a card, Firestore gets a new `order` that the sort criterion then ignores → card visually snaps back. Instead, disable `useSortable` and switch cursor from `grab` to `pointer` so the UX signal matches the behaviour.
- **Denormalize counts with `increment(±1)` to avoid subcollection reads from lists** (v1.5) — the Kanban card badge for "comments" reads `feature.commentCount`, so the card never has to subscribe to its own `features/{id}/comments` subcollection. `addDoc` to the subcollection + `updateDoc(parent, { commentCount: increment(1) })` on post, `-1` on delete. Accept that a mid-flight write failure can drift the count — fix with a reconcile job only if it ever matters.
- **TipTap `onUpdate` fires per keystroke — save on blur or explicit action** (v1.5) — wiring TipTap directly to a Firestore `updateDoc` writes on every character typed. Capture into a local draft state, show a dirty indicator, save on blur or an explicit Save button. Also dodges races with the live snapshot when another user edits concurrently.
- **Detail sheets that edit one of N items must be keyed by item id** (v1.5) — wrap the sheet body in a sub-component keyed by `feature.id` (or equivalent) so local drafts (title, description) reset when a different item is opened. Without the key, drafts leak across items and the user sees last session's draft on a freshly opened card.
- **Release notes are part of the release, not a follow-up** (v1.5 post-mortem) — the in-app `/feature-tracking` Release Notes tab uses a Server Component that reads `tasks/RELEASE_NOTES_*.md` at build time and bakes the parsed HTML into the static page. If a release ships to main without its `RELEASE_NOTES_vX.Y.Z.md` in the same PR, prod redeploys with the timeline missing that version — and there's no runtime fallback because the markdown lives in the deployed bundle, not Firestore. Always include the release notes file in the dev → main PR. Caught the day v1.5 shipped: PR #26 merged without `RELEASE_NOTES_v1.5.0.md`, prod went out blank for v1.5; required a follow-up docs PR. Discipline > defensive code here — making the page dynamic doesn't help, the file has to be in the deployment.
- **Client-side doc IDs in long-lived dialogs must regenerate per-open** (v1.5.1 hotfix) — `useState(() => doc(collection(...)).id)` runs once per component mount, and a dialog that's mounted at the page level (controlled via `open` / `onOpenChange` props) has the same mount lifetime as the page. Every `setDoc({sameId}, ...)` on submit then OVERWRITES the previously saved doc at that path. Pair the `useState` seed with a `useEffect(() => { if (open) regenerate(); }, [open, firestore])` so each open starts with a fresh id. Caught the same day v1.5 shipped: a client lost two features and was capped at three because every submit clobbered the previous one. Same pattern applies anywhere a client-side ID is generated for pre-save attachment uploads — always tie regeneration to the open/lifecycle event, never just the component mount.
- **Cross-story dependencies must be machine-readable, not buried in prose** (v1.6.2 mid-PR audit) — when the v1.7→v2.2 restructure shipped, a `quote-content-manager-seed` cross-ref patch said `"Content blocks read from the Quote Content Block Manager (1.8.1)"` on story 1.2.1 (v1.7). The restructure later moved 1.8.1 to v1.8 but didn't bring 1.2.1 with it — 1.2.1 ended up scheduled to ship a release before its dependency. A `general-purpose` audit agent walked all 95 planned stories and found 2 critical / 2 high / 3 medium / 4 low violations of the same pattern. Fix in three layers: (1) **schema** — `dependsOn: string[]` on every feature, validated at retarget time (`6.4.1` ships in v1.7); (2) **CI** — pre-merge regex `/\b\d+\.\d+\.\d+\b/g` against acceptance text + release-order check (`6.4.2` ships in v1.7); (3) **language convention** — every hard dep MUST start with the canonical `DEPENDS ON x.y.z` prefix; soft references use `RELATED:` or `See also:` (`6.4.3` ships in v1.7, doc-only). Until those land, every plan rewrite needs a manual audit pass — and it's worth running an audit anyway every time a seed retargets across releases (the `general-purpose` agent gets it done in ~8 minutes from scratch). The v1.6.2 mid-PR caught this BEFORE main; future plan rewrites should run the audit BEFORE opening the PR, not as a save during review.
- **One-shot seed buttons can spawn other one-shot seed buttons in the same dev cycle** (v1.6.2 process learning) — when you ship a "fix the planning" PR and find a planning bug DURING the PR review, the right move is another one-shot button on top of the same dev branch (NOT a separate v1.6.3 patch). Why: the user has already seen + accepted the original PR scope; opening a parallel patch fragments the review. The same `button → user clicks → button + module removed in same commit` pattern works recursively. v1.6.2 shipped 5 of these. Pre-merge state: clean — no buttons remain, all data lives in Firestore, release notes describe every seed in the lifecycle table. Just make sure the release notes get updated to ABSORB the new seed, not pretend it was always part of the original plan (the audit-driven section in `RELEASE_NOTES_v1.6.2.md` is the template).
- **Cross-cutting standards live in `tasks/CONVENTIONS.md` from v1.8 onward** — popups for confirmations, image-preload pattern, server-side fetch for cross-origin assets, one-shot seed lifecycle, `DEPENDS ON x.y.z` cross-story-dep convention, living-stories pattern, "don't expand release scope mid-cycle", release-notes-are-part-of-the-release. Stories should reference `tasks/CONVENTIONS.md` as the baseline rather than re-spelling each rule. Authored at v1.8 kickoff; expected to grow over time as new learnings codify. Note: the v1.6.2 audit lesson above is HISTORICALLY ACCURATE (story numbering said `6.4.x ships in v1.7`); the actual v1.7 user-feedback seed retargeted 6.4.1 / 6.4.2 / 6.4.3 to v1.8 where they're being built now.

---

## Documentation Index

All docs live in `tasks/` and `.agents/`. Read in this order when starting a session:

1. **`tasks/START_HERE.md`** — Bootstrap. Release state, current work, required reading order.
2. **`CLAUDE.md`** (this file) — Workflow rules, core principles, known lessons.
3. **`tasks/SESSION_HANDOVER.md`** — Deep technical context: data hierarchy, IDs, every subsystem.
4. **`.agents/evolution.md`** — Session history + architectural "why we do X".
5. **`tasks/CODEBASE_MAP.md`** — File index: what lives where.
6. **`tasks/RELEASE_NOTES_vX.Y.Z.md`** — Per-release changelog (v1.0, v1.1, v1.2, v1.2.1, v1.3, v1.3.1).
7. **`tasks/v1.4-trailers-module-status.md`** — Live state of current work.
8. **`tasks/v1.4-trailers-module-design.md`** — Design doc for current release.
9. **`testing/README.md`** + **`testing/HANDBOOK.md`** — Test philosophy, quality rules, QA onboarding.

**Whenever you ship a release** (dev or main):
- Append session entry to `.agents/evolution.md`
- Update `tasks/SESSION_HANDOVER.md` release table
- Update release status in this file's header table
- Update `tasks/v1.X-*-status.md` if applicable
- Create `tasks/RELEASE_NOTES_vX.Y.Z.md` (follow the layout — no pending-work checklists)
