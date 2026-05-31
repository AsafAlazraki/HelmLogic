# HelmLogic — Release Notes v1.9.5

> Release Date: 2026-05-14
> Branch: `claude/app-overview-wKiZ1` → main
> Planning + groundwork release — roadmap reshuffle (dealer-ops pivot) + NSM-Hub Service Quoting absorption groundwork + clickable release popups + emailTemplates rules hotfix

### Release Stats
- **17 commits** since v1.9.0 (`1d84f10` → `0bbb125`)
- **~8 files changed net** (most of the cycle was one-shot restructure tooling that was added AND removed within the cycle — net footprint is small: release-schedule runway, roadmap popup, plan docs)
- TypeScript: zero new errors
- `npm run build`: clean
- One-shot tooling lifecycle: 5 modules + 2 buttons added for the restructure, all removed post-apply (per CONVENTIONS.md). Net code delta excludes them.

### What this release IS — and is NOT
**v1.9.5 is a planning + groundwork + hotfix release, NOT a feature build.** It ships the roadmap reshuffle (the dealer-ops priority pivot stakeholders asked for), the *planning* for the NSM-Hub Service Quoting absorption (Epic 11 seeded as backlog — **no service-quoting code is built yet**), a roadmap UX improvement, and a production rules hotfix. The actual dealer-ops + Service Quoting **build** begins at **v1.10**.

It's a fractional release in the lineage of v1.5.1 / v1.6.1 — a deliberate "between releases" ship for planning + a prod fix that shouldn't wait for v1.10.

---

## Roadmap reshuffle — dealer-ops pivot

Stakeholder meetings (May 2026) reset priorities: dealer-ops work (Fit-up, Module management, Parts + pricing catalogs, Guided Config) moves up; customer-facing work slides out but stays on the roadmap. This release executed that across the entire planning board via one-shot tooling.

### What happened to the planning data
- **157 in-scope stories re-targeted** via capacity-aware bin-packing across sequential v1.X releases (≤20 pts/release): dealer-ops front-loaded from v1.10, customer-facing from v1.18, notifications last.
- **Submitted column drained** — 35 unscheduled stories pulled in; bugs routed to early releases (v1.10–v1.14), non-bug cross-cutting spread across mid releases, every story filed into its epic swim-lane where one matched.
- **Capacity discipline** — a unified capacity tracker guarantees no release exceeds the 20-pt cap and nothing is left unscheduled.

### Roadmap schedule change
- `release-schedule.ts` now generates a **sequential v1.10 → v1.40 runway** (no artificial jump to v2.0 — we reach v2.0 organically when the v1.X runway fills). v2.x columns removed for now; they return when we approach them.

### How it was done (and cleaned up)
The reshuffle ran through one-shot in-app tooling (an Auto-Apply button + a manual Workbench), exactly like prior planning seeds. After the operator clicked Apply, all 5 tooling modules + both buttons were removed in the same cycle (`ffc49cc`). The planning data lives in Firestore; the scaffolding is gone.

---

## NSM-Hub Service Quoting absorption — GROUNDWORK (planned, not built)

NSM-Hub (`nsm-service-quotation`) is Northside Marine's parallel service-operations app. After studying the repo, the decision (locked with stakeholders) is to **absorb its Service Quoting module into HelmLogic** as a new dealer-ops surface, on a shared schema, migrating all existing data with zero downtime. Everything else in NSM-Hub (bookings, diagnostics, insurance, its duplicate Highfield CPQ) is **out of scope** — HL's quote flow remains the one CPQ.

This release seeds the **planning** for that work — it builds nothing yet:

### Epic 11 — Service Quoting (11 stories, ~49 pts, v1.10–v1.13)
Seeded onto the roadmap as backlog: schema + collections, service-catalogue admin (operations + parts), the 4-step create wizard, operation editor (labor + parts), dashboard + cards, view/edit + status lifecycle, service-quote PDF, send-via-email, customer reconciliation, migration tooling, and cutover.

### The backend setup we are preparing for
This release documents (in `tasks/nsm-hub-merge-plan.md`) the full engineering groundwork the v1.10+ build will execute:
- **Shared-schema collections** under HL Firestore: `serviceQuotes`, `serviceOperations`, `serviceParts` (org-scoped, HL conventions).
- **Zero-downtime migration architecture** — daily active use means a single cutover would lose data, so: dual-project Firebase Admin SDK reader (`nsm-service-quotation` → transform → HL writer), **continuous delta-sync** (idempotent upsert by natural key) under live writes, then a **tight off-hours cutover** with a final delta pass (minutes, not hours). Dual-write bridge held in reserve if a zero-second cutover is mandated.
- **Service-account pre-flight** — a read service-account for the `nsm-service-quotation` project is required before any migration runs (NSM-Hub equivalent of the SharePoint / email admin tasks).
- **Customer reconciliation** — link migrated service quotes to HL's existing `customers` (no parallel set); snapshot on the quote.
- **uid mapping** — NSM-Hub creator uid → HL uid table so migrated quotes keep correct ownership; NSM staff become HL users under the Northside Marine org.
- **CPQ-drop decision** — NSM-Hub's catalogue/BMTQuote is not in production use and is dropped, not migrated.

Full study + plan: `tasks/nsm-hub-merge-study.md` + `tasks/nsm-hub-merge-plan.md`.

---

## Clickable release headers (roadmap UX)

Each Roadmap release column header (`v1.10 · 20 pts · 15 items`) is now a button. Clicking it opens a **release-detail popup** describing that release's activities:
- Header with release name + Shipped / MVP-target badge + a summary (N activities · X pts · M epics).
- Stories grouped by epic (colour dot + epic label + per-epic count/points), each a clickable row showing title + points + status.
- Click a story → opens its full detail sheet.
- Works on the Backlog column too.

Read-only drill-in; no writes.

---

## 🔧 Hotfix — "Something went wrong" on Create Proposal (prod)

A prod user (Bill Hull) hit a full-page **"Something went wrong — Missing or insufficient permissions"** crash going to Create Proposal, citing a `list` on `organisations/{orgId}/emailTemplates`.

**Root cause (NOT the rules):** the deployed Firestore rules are correct — `emailTemplates` allows `read` (covers `list`) for any signed-in user, and Bill is signed in. The real bug is in the app:

1. `SendQuoteDialog` is mounted by `proposal-view` **whether or not it's open**, and it called `useEmailTemplates(...)` **unconditionally on mount** — so the emailTemplates query fired on *every* proposal / Create-Proposal load, even though email sending is gated off in prod.
2. That query used `orderBy('isDefault','desc').orderBy('updatedAt','desc')`, which forces a **composite index**. If the index isn't deployed (or any transient/propagation read error occurs), the query fails.
3. The Firebase **error-emitter** promotes any such `useCollection` read failure into a throw that the **global error boundary** (`app/global-error.tsx`) renders as the full-page "Something went wrong" — so a non-critical template read white-screened the entire proposal flow.

**Fix (code, two parts):**
- `send-quote-dialog.tsx` — only subscribe to email templates when the dialog is actually **open** (`useEmailTemplates(open ? orgId : null, …)`). On Create Proposal (dialog closed) the query no longer fires at all → no crash.
- `email-send.ts` `useEmailTemplates` — dropped the `orderBy` clauses (single equality filter needs no composite index) and **sort client-side** instead (the list is a handful of templates). Removes the index-dependency failure mode entirely, so even when the dialog opens the read is robust.

No rules change — the repo + deployed rules were already correct. (The earlier instinct to re-deploy rules was wrong; the deployed ruleset was verified identical to the repo, with `emailTemplates` present and correctly nested.)

---

## Files Changed
```
src/lib/
  release-schedule.ts          (v1.9.5 added shipped; sequential v1.10–v1.40 runway; v2.x removed)

src/components/
  roadmap-view.tsx             (clickable ReleaseHeader + ReleaseDetailDialog popup)
  backlog-view.tsx             (one-shot restructure tooling added + removed within the cycle — net baseline)
  send-quote-dialog.tsx        (HOTFIX — only subscribe to templates when dialog is open)

src/lib/
  email-send.ts                (HOTFIX — useEmailTemplates: drop orderBy / composite-index dep, sort client-side)

firestore.rules                (unchanged — verified correct + already deployed; NOT the cause)

tasks/
  RELEASE_NOTES_v1.9.5.md      (this file)
  USER_GUIDE_v1.9.5.md         (operator guide)
  v1.10-restructure-plan.md    (reshuffle plan)
  nsm-hub-merge-study.md        (NSM-Hub repo study)
  nsm-hub-merge-plan.md         (Service Quoting absorption plan + migration architecture)

REMOVED (one-shot tooling, added + deleted within the cycle):
  src/components/restructure-workbench.tsx
  src/lib/v110-restructure-apply.ts
  src/lib/v110-restructure-rules.ts
  src/lib/v110-service-quoting-seed.ts
```
