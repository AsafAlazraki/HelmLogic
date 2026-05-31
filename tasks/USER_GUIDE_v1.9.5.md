# HelmLogic v1.9.5 — User Guide

> Audience: org admins + salespeople.
> Companion to: `tasks/RELEASE_NOTES_v1.9.5.md` (engineering changelog).

v1.9.5 is a **planning + groundwork release** — it reshuffles the roadmap, plans the upcoming Service Quoting capability, adds a roadmap drill-in, and fixes a permissions error on Create Proposal. It does **not** add new day-to-day features for salespeople yet (the dealer-ops + Service Quoting *build* starts at v1.10).

---

## At-a-glance map

| What you want to do | Where | Section |
|---|---|---|
| See what's planned in any release | `/feature-tracking` → Roadmap → click a release header | [Release drill-in](#1-click-a-release-to-see-whats-in-it) |
| Understand why the roadmap looks different | Roadmap | [The roadmap reshuffle](#2-the-roadmap-reshuffle) |
| Know what Service Quoting will be | Roadmap → Epic 11 | [Service Quoting is coming](#3-service-quoting-is-coming-planned) |
| Get past the "Something went wrong" error on Create Proposal | (admin) re-deploy Firestore rules | [The Create Proposal fix](#4-the-create-proposal-fix) |

---

## 1. Click a release to see what's in it

On the **Roadmap** tab, every release column header (e.g. `v1.10 · 20 pts · 15 items`) is now clickable.

### To use it
1. Open `/feature-tracking` → **Roadmap**.
2. Click any release column header.
3. A popup opens listing every activity in that release, **grouped by epic** — each story shows its title, points, and status.
4. Click any story in the popup to open its full detail.
5. Works on the **Backlog** column too (stories with no target release yet).

### Tips
- Use it as a quick "what are we committing to in v1.12?" check without scrolling the whole grid.
- The header colour still signals capacity (green / amber / red) and shipped (emerald) at a glance; the click gives you the detail.

---

## 2. The roadmap reshuffle

Following stakeholder priorities, the roadmap was reorganised so **dealer-ops work comes first**:
- **Dealer-ops** (Fit-up, Module management, Parts + pricing, Guided Config) is front-loaded from v1.10.
- **Customer-facing** work (sales lifecycle extensions, etc.) slid to later releases — still on the roadmap, just sequenced after dealer-ops.
- **Bugs** from the Submitted column were pulled into early releases (v1.10–v1.14) to be fixed sooner.
- Every release is held to a ≤20-point cap, and the schedule now runs as a clean sequential v1.X (v1.10, v1.11, … v1.40) with no jump to v2.0.

### What this affects
- The Roadmap columns + what's in each release look different from before — this is intentional.
- Nothing you've shipped changed; this is forward planning only.
- The Submitted column on the Board should be much emptier — most items now have a target release.

---

## 3. Service Quoting is coming (planned)

A new **Epic 11 — Service Quoting** appears on the Roadmap (v1.10–v1.13). This is the plan to bring Northside Marine's service-quoting capability (from the separate NSM-Hub app) into HelmLogic as a built-in module: quote a customer's service work (labor + parts per operation), backed by a service catalogue, with all existing service-quote data migrated over.

**Important: this is planned, not built yet.** The Epic 11 cards describe what's coming; the actual feature work happens across v1.10–v1.13. Keep using NSM-Hub for service quotes for now — nothing changes for you until those releases ship and your data is migrated (which will happen with no downtime).

### What's coming in the Service Quoting module
- A service-quote dashboard + create wizard (customer/boat → operations → summary).
- A service catalogue of predefined operations + parts to build quotes from.
- Service-quote PDF + send-to-customer via the existing email pipeline.
- A status lifecycle (Estimate → Approved → Complete).
- One-time migration of every existing NSM-Hub service quote + the catalogue.

---

## 4. The Create Proposal fix

Some users saw **"Something went wrong — Missing or insufficient permissions"** when moving a quote to **Create Proposal**. This was a Firestore Security Rules issue — the deployed rules in Firebase Console had drifted and were missing the email-templates permission that the proposal flow needs.

### What an org admin / HelmLogic admin needs to do
Re-publish the **complete** `firestore.rules` to Firebase Console (Firestore → Rules → paste the full ruleset → Publish). After publishing, eyeball-confirm these paths exist in the deployed editor: `emailTemplates`, `auditLog`, `sentEmails`, `contentBlocks`, `contentOverrides`, `compatibilityRules`, `sharePointConfig`, `pdfStructure`, `salesTeam`.

Once re-deployed, Create Proposal works normally again — no app change needed.

### Why it happened
Firestore rules are published by pasting the whole ruleset into the Console; a partial paste in a prior deploy dropped the email-templates block. The repo's rules file was always correct — only the deployed copy had drifted. (We've reinforced the "always paste the full file + verify after publish" discipline in our process notes.)

---

## What v1.9.5 did NOT ship (coming in v1.10+)
- Any built dealer-ops or Service Quoting feature — v1.9.5 is planning + groundwork only.
- The NSM-Hub data migration — designed + documented, executed in the v1.10+ Service Quoting build.
- New salesperson-facing workflow — your day-to-day is unchanged except the Create Proposal fix + the roadmap drill-in.
