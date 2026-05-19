# HelmLogic v1.9 — User Guide

> Audience: org admins + salespeople using the v1.9 quote-lifecycle features.
> Companion to: `tasks/RELEASE_NOTES_v1.9.0.md` (engineering changelog).

This guide walks through every operator-facing capability v1.9 added. If you're reading the in-app **Feature Tracking → Release Notes** tab, those notes are the engineering summary; this is the practical "how do I use it" version.

---

## At-a-glance map

| What you want to do | Where to do it | Section |
|---|---|---|
| See the customer PDF inline before downloading or sending | Proposal header → **Preview** button | [Quote Preview](#1-quote-preview--see-the-pdf-before-sending) |
| Track where a quote sits in the sales journey | Status badge in the proposal header → click to change | [Lifecycle States](#2-lifecycle-states--track-the-sales-journey) |
| Offer the customer multiple framings of the same boat | Proposal header → **Scenario** button | [Multiple Scenarios](#3-multiple-scenarios--offer-the-customer-different-framings) |
| Stop two incompatible features being picked on the same quote | Automatic — happens in the quote flow | [Compatibility Rules](#4-compatibility-rules--automatic-conflict-detection) |
| Mirror customer-quote PDFs into your SharePoint site | `/manage` → **Integrations** → SharePoint config | [SharePoint Mirror](#5-sharepoint-mirror--your-quotes-in-sharepoint) |

---

## 1. Quote Preview — see the PDF before sending

The **Preview** button is now in every proposal's toolbar, between **Send Quote** and **Download PDF**. Click it to open the customer-facing PDF inline in a side sheet — same render that Download produces, same render the customer will see when you send.

### To preview a quote

1. Open any quote in the proposal view
2. Click **Preview** (eye icon) in the top-right toolbar
3. A side sheet opens with the PDF rendered inside it — use the browser's PDF controls to zoom, page through, or search text
4. Click **Download** in the sheet header to save the same PDF to your machine without re-rendering, or click the X to close

### What this affects

- **Nothing on the customer's side** — Preview is read-only and never sends anything anywhere
- **No second render** — when you click Download from inside the Preview sheet, the same in-memory PDF is reused (faster + guaranteed byte-for-byte match)
- **Works on locked quotes** — Preview doesn't modify the quote, so locked quotes preview fine

### Tips

- Use Preview before clicking **Send Quote** to catch typos, broken images, or sub-header mistakes before the customer sees them
- If the cover image looks weird in Preview, it'll look weird on the customer's PDF — fix it at the source (boat range cover image OR org-level override)
- Preview content reflects all your personalisations (per-quote content overrides via the **Personalise** sheet) — so you're seeing exactly what the customer would receive

---

## 2. Lifecycle States — track the sales journey

Every customer quote now has a **lifecycle state** that tracks where the customer is in the sales journey, independent of the v1.8 lock layer. The state appears as a coloured pill next to the quote number in the proposal header.

### The 7 states

| State | When to use | Pill colour |
|---|---|---|
| **Draft** | You're still building the quote, haven't sent it yet | Slate |
| **Sent** | Email is out the door, customer hasn't responded | Blue |
| **Viewed** | Customer has opened the email or proposal | Indigo |
| **Accepted** | Customer agreed — expect deposit / order paperwork next | Emerald |
| **Rejected** | Customer explicitly declined | Rose |
| **Lost** | Customer ghosted you or went elsewhere | Amber |
| **Expired** | The 30-day validity window passed | Slate |

### To change a quote's state

1. Open the quote in the proposal view
2. Click the state pill in the header (e.g. **Draft**)
3. A picker appears with all 7 states; click the one you want
4. The pill updates instantly + a toast confirms; an audit-log entry captures who changed what and when

### Auto-transitions

- **Draft → Sent** fires automatically the first time you successfully send the quote via the **Send Quote** dialog. Re-sends do NOT clobber any later state you've manually picked (so you won't lose an "Accepted" status by re-sending the PDF for reference)
- All other transitions are manual today. Email-open tracking → auto-Viewed is on the v1.10+ backlog (waiting on email infra)

### What this affects

- **The Activity tab** captures every transition with a `from → to` summary so the audit trail tells the full story
- **The Roadmap, the dashboard, anywhere quotes are listed** can filter / colour by lifecycle state (extensible — current views show the pill in-line)
- **Locked quotes can still transition** — sending the quote auto-locks it, but you can still mark it Accepted / Rejected / Lost / Expired afterwards. The lock gates content edits; the lifecycle is orthogonal

### Tips

- **Stock items don't have a lifecycle state** — only customer proposals do. Stock keeps its simple "stock" badge
- **Don't worry about misclicks** — there's no enforced state graph (you can go any → any), and the audit log captures every change. Re-pick the correct state and move on
- **Expired** is manual today; set a calendar reminder when you create a quote and flip it to Expired if 30 days pass without acceptance

---

## 3. Multiple Scenarios — offer the customer different framings

Sometimes the same customer wants to see "what would it look like with a trade-in?" alongside "what if I pay cash?" alongside "what about the finance bundle?". v1.9 makes these a first-class concept: each is a **scenario** of a single quote family, sharing a root quote but each with its own quote number, lifecycle state, and personalisations.

### When to use scenarios vs separate quotes

- **Use scenarios** when offering the same boat configuration to the same customer with different commercial framings (trade-in / cash / finance / with-trailer / without-trailer)
- **Use separate quotes** when the customer is comparing different boats, or when different salespeople own different quotes

### To create a scenario

1. Open any quote in the proposal view
2. Click the **Scenario** button (Layers icon) in the toolbar
3. The dialog opens with one text field and 5 quick-pick suggestions
   - Quick-picks: *Trade-in option · Cash deal · Finance bundle · With trailer · Without trailer*
   - Or type your own label (e.g. "VIP package")
4. Click **Create scenario** or press Enter
5. A new quote is created and you're redirected to it — same content as the source, fresh draft state, new quote number, with the scenario label shown as an indigo chip in the header next to the lifecycle pill

### Navigating between siblings

- Open the **Activity** tab on any scenario
- A **Scenarios** sub-section at the top lists the root + every scenario, with lifecycle pills + lock indicators
- The currently-viewed scenario is highlighted; click any other row to jump straight to it

### What carries over / resets when you create a scenario

| Carries over | Resets to fresh |
|---|---|
| Customer details, boat config, motor, trailer, dealer fit, financials | Quote number (new) |
| All content-block personalisations (your Personalise sheet edits) | Lifecycle state → Draft |
| Assigned salesperson | Lock state → unlocked |
| Cover image, banners, branding | Send history (`lastSentAt` + `sentCount`) → cleared |

### What this affects

- **Each scenario gets its own customer-facing PDF** — when you send "Trade-in option", that's what the customer sees, not the cash-deal scenario
- **SharePoint mirror** (if configured) creates a separate subfolder per scenario inside the customer's quote-family folder
- **The Activity tab** captures the `scenario-created` event on both the root and the new scenario

### Tips

- **The scenarioLabel is internal-only** — the customer never sees it on the PDF. It's how you identify which framing in your sibling list
- **A scenario of a scenario still siblings under the root** — if you make a scenario from "Trade-in option", the new sibling shows up under the original root, not nested two-deep. Keeps the family flat
- **v1.8 fork-on-edit still works** — locking and forking a scenario produces a v2 of that scenario specifically. Versions and scenarios are orthogonal concepts

---

## 4. Compatibility Rules — automatic conflict detection

v1.9 lays the groundwork for the quote builder to refuse two-feature combinations that the boat manufacturer marks as incompatible. Examples seeded for Highfield:

- **Two sun-shades** can't both be picked (forbids pattern)
- **A helm seat requires a console** (requires pattern)
- **Bow ladder vs anchor locker** (forbids pattern)

### How rules are authored today (v1.9)

For v1.9, engineering writes rules directly into Firestore — there's no admin UI yet. The three Highfield templates are seeded as `isActive: false` placeholders. To activate one:

1. Engineering / HelmLogic admin opens Firebase Console → Firestore
2. Navigates to `modules/M1Yf3R9igpJDxJnOVr6f/compatibilityRules/{ruleId}`
3. Replaces the placeholder `featureA` / `featureB` IDs with real Highfield feature IDs
4. Sets `isActive: true`
5. The next quote build picks up the rule automatically

A first-class admin UI for org admins to author + edit rules without touching Firestore lands in v1.10+. Until then, contact your HelmLogic admin if you want a new rule added.

### What this affects

- **Quote builder warns or blocks** the operator if two flagged features are picked together (depending on rule kind: `forbids` blocks, `requires` warns when the dependent feature is missing)
- **The reason text** authored on each rule appears in the warning so the operator knows why the combination is rejected

---

## 5. SharePoint Mirror — your quotes in SharePoint

v1.9 ships a one-way mirror of your customer-quote PDFs into a SharePoint site folder tree. HelmLogic stays the source of truth; SharePoint is a read-only artefact for non-HL stakeholders (your finance team, accountants, dealer-network ops, anyone who needs the PDF but isn't a HelmLogic user).

### What the mirror looks like

```
{your SharePoint folder root}/
  HelmLogic — Northside Marine/
    Bill Hull/                                   ← salesperson
      Smith Family — NSM-Q23ABC/                 ← customer + root quote#
        Original/
          Quote.pdf
        Trade-in option/                         ← scenario sibling
          Quote.pdf
        Cash deal/
          Quote.pdf
        v2/                                      ← fork-on-edit child
          Quote.pdf
```

Every quote in the same family lives under one customer folder. Scenarios and forks become sibling subfolders. The folder shape mirrors HelmLogic's own structure, so navigating SharePoint feels like navigating HelmLogic.

### When the sync runs

The mirror updates automatically on five events. You don't trigger anything manually:

1. **Finalize** — first PDF lands the moment you save a new quote
2. **Send** — every successful Send replaces the PDF with the exact version the customer received (byte-for-byte match)
3. **Scenario create** — the new sibling subfolder appears with its initial PDF
4. **Fork-on-edit** — the v{N} subfolder appears with the fresh v2 PDF
5. **Terminal lifecycle** — when you mark a quote Accepted / Rejected / Lost / Expired, the PDF re-syncs with any final edits

If a sync fails for any reason (SharePoint down, Azure consent issue, etc.), the failure is silent on your end — HelmLogic logs it but the quote operation completes normally. SharePoint can recover later without you having to redo anything.

### To set up the SharePoint mirror

Three preconditions, all handled by your HelmLogic admin:

1. **Azure app registration** — HelmLogic admin registers the multi-tenant "HelmLogic SharePoint Sync" app, grants `Files.ReadWrite.All` + `Sites.ReadWrite.All`, sets the client secret in Firebase env. Done once for all orgs.
2. **Your org grants the app consent** — you (as your M365 admin) accept the consent prompt for your tenant, giving HelmLogic write access to your SharePoint site
3. **Config doc written** — either:
   - Open `/manage` → **Integrations** tab → fill in tenantId / clientId / siteId / folderPath → flip **enabled** → Save
   - Or HelmLogic admin writes it directly to Firestore

Until `NEXT_PUBLIC_SHAREPOINT_ENABLED=true` is set by HelmLogic, the sync hooks are dormant and nothing uploads. Once it's flipped, syncs start firing on the next finalize / send / scenario / fork / terminal event.

Full setup walkthrough lives at `tasks/ADMIN_TASK_sharepoint-setup.md` — paste it to whoever runs your Azure environment.

### What this affects

- **Quote doc gets three new fields** on successful sync: `sharePointSyncedAt` (timestamp), `sharePointPath` (full path string), `sharePointWebUrl` (clickable Graph link). These are visible only via Firestore today; surfacing them in the proposal UI is on the v1.10 list
- **Locked quotes still sync** — every Send auto-locks the quote, then syncs immediately. The Firestore rules whitelist the three sync-tracking fields so this works seamlessly
- **Re-syncs overwrite** — when a quote re-syncs (e.g. after a terminal-lifecycle transition), the file at the same SharePoint path is replaced. Latest wins. SharePoint's own version history retains the prior versions if you ever need to roll back from the SharePoint side

### Tips

- **Don't edit the SharePoint copies directly** — they're a one-way mirror. Anything you change in SharePoint will be overwritten on the next sync from HelmLogic. Edit the source in HelmLogic and let it propagate
- **Share SharePoint folders with stakeholders** using SharePoint's own permission system — managers, accountants, the dealer-network team. They get read access to the quote folder without needing HelmLogic accounts
- **Sync failures don't block your work** — if the sync silently fails (Azure outage, consent expired, network), HelmLogic continues normally. Ask your admin to check the Firebase App Hosting logs for `[sharepoint-sync]` lines if folders aren't appearing

---

## How quote families work

A **quote family** is the set of all quotes related to the same customer + boat config. Three relationship types nest inside:

### 1. The root
The original quote. Has no `parentQuoteId`, no `scenarioLabel`. Lives at the top of the family.

### 2. Scenarios (v1.9, 1.1.3)
Siblings of the root. Same `parentQuoteId` (= root's id), each with a `scenarioLabel` ("Trade-in option" etc.) and its own quote number. All scenarios sit at the same "version 1" level.

### 3. Forks (v1.8, 1.3.1)
Children of any locked quote (root or scenario). Have `parentQuoteId` pointing at the immediate parent, with `version: parent.version + 1`. Created when you click "Create v2" on a locked quote and confirm the fork-on-edit popup.

In a typical family you might have:
- 1 root (Original)
- 2 scenarios (Trade-in option, Cash deal)
- 1 fork of the original (v2 — created after sending v1 and finding a typo)

All five quotes share the same family. The Activity tab's Scenarios sub-section shows them grouped. The SharePoint mirror reflects the same shape.

---

## What v1.9 did NOT ship (deferred to v1.10+)

These pieces were on the v1.9 plan but moved out during the cycle, or were explicitly out-of-scope:

| Story | Why it's not in v1.9 |
|---|---|
| **1.3.2** Contract Signing Pack | Pack delivery is email-adjacent; held until email decisions land |
| **1.8.3** `startsOnNewPage` UI | The v1.7 PDF architecture renders every content block on its own A4 page already — the schema field is dormant. Layout refactor needed to make it actionable, which is bigger than the original 1-pt slice. Deferred until there's a real multi-block-per-page case |
| **Compatibility Rules admin UI** | Engineering authors rules direct to Firestore for v1.9 (3 Highfield example templates seeded as inactive). First-class admin UI is v1.10+ |
| **Viewed-via-open-tracking auto-transition** | Email-infra dependency — same gate as 1.3.2. Manual transition to Viewed works today |
| **Two-way SharePoint sync** | Out of scope by design — SharePoint is a one-way read-only mirror. Edits there don't flow back. v1.10+ if any org needs it |
| **Time-based quote expiry cron** | Manual transition to Expired works today. Automatic expiry on the 31st day is v1.10+ |
| **Retroactive SharePoint backfill** | Only newly-finalized quotes (and their later events) sync. A one-shot backfill button for pre-v1.9 quotes is v1.10+ if anyone asks |

---

## Pre-flight: things to verify after v1.9 deploys to prod

Quick checklist for your first session on the new build:

- [ ] **Roadmap** shows v1.9 as Shipped (emerald pill on the column header)
- [ ] Open any existing quote → status pill in the header now reads **Draft** (defaulted from the legacy state)
- [ ] Open the Activity tab → confirm prior audit events still render (no regression on v1.8 audit log)
- [ ] Open the **Preview** button on a real quote → confirm the PDF matches what Download would produce
- [ ] Try creating a Scenario → confirm the new sibling appears in the Activity Sheet's Scenarios sub-section
- [ ] Open `/manage` → **Integrations** tab → confirm the SharePoint config form renders (warning banner about env flag is expected until your admin flips it)

If any of these don't match — that's a regression worth reporting before you start trusting the new surfaces in production.
