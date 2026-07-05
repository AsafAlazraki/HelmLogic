# Release PR draft — dev → main, v1.18 → v1.31

> Prepared 2026-07-05. **Not opened** — Asaf opens/merges when ready. Copy the title + body below into the GitHub PR form (base `main`, compare `claude/app-overview-wKiZ1`).

---

## Title

```
Release v1.18 → v1.31 — MPF migration, evidence overhaul, CRM/contract lifecycle, notifications
```

## Body

```markdown
## Scope

Fourteen dev releases (185 commits since main's v1.17 tip `c9b8b2c`), each with release notes + user guide in `tasks/`:

| Release | Theme |
|---|---|
| v1.18 | Catalog polish + first customer-facing surface + Shopify spike |
| v1.19 | Pricing discipline + variations foundation |
| v1.20 | Quote-to-Contract lifecycle + variation surfaces |
| v1.21 | Customer CRM foundation |
| v1.22 | Sales workspace shell |
| v1.23 | Pipeline + payments + my-work |
| v1.24 | Customer depth (notes timeline, journey, order tracking) |
| v1.25 | Quote tooling |
| v1.26 | Global Search + customer/quote feature helpers |
| v1.27 | Customer documents + customer-specific promos — **partial: 2.5.2 blocked on Revolution access; window honestly unflagged** |
| v1.28 | Co-buyers, refunds, promotion stacking |
| v1.29 | (window skipped, empty) |
| v1.30 | Notification system foundation (10.1.1–10.1.5) |
| v1.31 | **MPF migration + Testing & Evidence overhaul** — NSM's 17-workbook Master Price File migrated 1:1 (36,551 writes / 0 errors), parity proven, NSM Recommended quote-flow wiring, MPF Data admin tab, Counter Quotes (standalone motor / trailer / rigging quoting), Step-5 curation engine, hunt-wave audits |

## The proof (v1.31 evidence package)

- **MPF parity**: 34,498 / 34,512 automated checks, every fail individually explained — zero unexpected deltas (`tasks/test-evidence/MPF_PARITY.md`)
- **Ultimate test**: same SP560 package priced by the MPF's own recalculated formulas and by HelmLogic in a real browser — **$79,022 = $79,022, seven line items, $0.00 delta on every one** (`tasks/test-evidence/ultimate-test/`)
- **Full fleet walk**: every Highfield model (85) driven through Steps 1–6, 640/640 variants, 32,816/32,816 on-screen price assertions (`tasks/test-evidence/highfield-walk/`)
- **Relation web**: all 809 imported boats, six relation families, **ALL SETS EQUAL, 0 unexplained** (`tasks/test-evidence/PER_BOAT_SETS.md`)
- **Three adversarial audits** (interface / structure / financial invariants) closed with every flag source-verified; zero data patches needed on our side (`UI_AUDIT.md`, `STRUCTURE_AUDIT.md`, `INVARIANTS_AUDIT.md`)
- **Fail→Fix→Retest ledger**: FFR-1…32, every failure with root cause, fix and green re-run (`fail-fix-retest.json`) — latest: FFR-32, GT consoles never offer or charge a seat (FCT comes standard), found by Asaf in the field and closed same-day
- **Unit suite**: 554/554 (money math + curation + carousel + rego), CI gate + nightly synthetic battery
- **Release-tip battery**: fresh full run at this PR's tip (`c6067aa`): **34,580 / 34,594** — the only 14 fails are the standing, individually-explained set (2 negative-sell rows faithful to NSM's own Parts Maintenance sheet + 12 documented menu skips: 11 Mercury/Jeanneau package powerplants approved as import skips + the CC7.5 trailer reference dangling in NSM's own source)
- **Grand report**: `tasks/HelmLogic_Evidence_Report.pdf` (31 pp, regenerated 2026-07-05, all 26 data sources live)

## 🚨 Deploy-day checklist (after merge)

1. **Publish `firestore.rules` from this branch tip** (full-file paste, Firebase Console → Rules). New since the last publish: `users/*/notifications` cross-user `create`, `features/*/auditLog` read/write. Post-publish, spot-check by eye that these paths exist in the deployed text: `emailTemplates`, `auditLog`, `sentEmails`, `contentBlocks`, `contentOverrides`, `compatibilityRules`, `sharePointConfig`, `pdfStructure`, `salesTeam`, `priceLists`, `serviceQuotes/{id}/sentEmails`, the recursive `models`/`ranges` group-read rules, `notifications` with `allow create: if isSignedIn()`, and `auditLog` inside `features`.
2. **Env flags stay as-is** unless stakeholder setup is done: `NEXT_PUBLIC_EMAIL_SEND_ENABLED` (SendGrid/sender-domain, `tasks/ADMIN_TASK_email-trigger-setup.md`), `NEXT_PUBLIC_SHAREPOINT_ENABLED` (Azure app + `SHAREPOINT_CLIENT_SECRET`, `tasks/ADMIN_TASK_sharepoint-setup.md`).
3. **Release Notes tab** bakes from `tasks/RELEASE_NOTES_*.md` at build time — all fourteen files are in this PR, so the in-app timeline will be complete.

## NSM asks (returned-value findings, unchanged by this PR)

Yamaha image assets · SharePoint file exports · fresh Yamaha price file · their Stabicraft FO re-key · 7 below-cost Stacer hulls · 29 motor-menu-vs-HP-column contradictions · 4 dead/unpriced trailer references · the digitless "HIGHFIELD - Patrol" pack size · NEW-3/NEW-4 factory-option scoping rulings.
```
