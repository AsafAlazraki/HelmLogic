# HelmLogic — Release Process (Going Forward)

> Codifies the per-release deliverables and the "user guide per release" convention introduced in v1.7. Any release after v1.6.2 should follow this checklist.

---

## What ships with every release

A release is **not done** until ALL of the following exist on the dev branch BEFORE the dev → main PR opens:

| Artefact | Path | Purpose | Required |
|---|---|---|---|
| **Release notes** | `tasks/RELEASE_NOTES_vX.Y.Z.md` | Engineering changelog — what was built, files changed, behaviour changes. Read in-app via `/feature-tracking` → Release Notes. | ✅ Always |
| **User guide** | `tasks/USER_GUIDE_vX.Y.Z.md` | How to actually USE the new features. Practical, screenshot-friendly. Audience: org admins + salespeople. | ✅ Always when release adds user-facing capability |
| **Status doc update** | `tasks/vX.Y-*-status.md` (e.g. `tasks/v1.7-planning-restructure-status.md`) | Phase-by-phase build state. Flip "phase: built" → "phase: shipped to dev → shipped to main" as gates pass. | ✅ When a status doc exists for the release |
| **CLAUDE.md table** | `CLAUDE.md` → "Current State" table | Single source of truth for what release the project is on. | ✅ Always |
| **`.agents/evolution.md`** | `.agents/evolution.md` | Session log + architectural rationale ("why we did X this way"). Append a new session entry. | ✅ Always |

### Why a User Guide per release

`tasks/RELEASE_NOTES_vX.Y.Z.md` describes WHAT was built and answers "what changed since last release". It's an engineering artefact.

`tasks/USER_GUIDE_vX.Y.Z.md` describes HOW the new features are USED and answers "I'm an admin / salesperson — what do I do with this?". It's a customer artefact.

Without the user guide, every release ships features that nobody knows how to find or use, and the in-app `/feature-tracking` tab becomes a wall of engineering jargon that doesn't help operators.

The pattern: **release notes for the team, user guide for the operators**. Both ship in the same dev → main PR.

---

## Release types + what they cover

| Type | Trigger | Notes file required | User guide required |
|---|---|---|---|
| **Minor** (vX.Y.0) | New capability, multi-week build | ✅ Full | ✅ Full |
| **Patch** (vX.Y.Z, Z>0) | Hotfix, planning restructure, single-purpose follow-up | ✅ Full | Optional — only if user-facing UX changed |
| **Pre-release** (vX.Y.0-rc, optional) | Internal QA snapshot — not common for HelmLogic | ✅ Full | Optional |

---

## Pre-merge checklist (paste into the dev → main PR description)

```
Release: vX.Y.Z
Branch: claude/app-overview-wKiZ1 → main

Artefacts on dev branch:
- [ ] tasks/RELEASE_NOTES_vX.Y.Z.md present
- [ ] tasks/USER_GUIDE_vX.Y.Z.md present (or N/A — patch with no UX change)
- [ ] CLAUDE.md release-state table flipped to ✅ Shipped to dev
- [ ] tasks/vX.Y-*-status.md phase line updated (if status doc exists)
- [ ] .agents/evolution.md session entry appended
- [ ] firestore.rules diff reviewed (and 🚨 DEPLOY RULES message posted to user if changed)

Build / type:
- [ ] `npx tsc --noEmit` — no NEW errors introduced by this release
- [ ] `npm run build` — clean

Smoke test in browser (if user-facing):
- [ ] Golden path through the new feature completes
- [ ] Existing features (regression check on the most-used flow) still work
```

---

## "Release notes are part of the release" — the v1.5 lesson

The in-app `/feature-tracking` Release Notes tab is rendered server-side by reading `tasks/RELEASE_NOTES_*.md` at build time. The parsed HTML is baked into the static page bundle.

**Implication**: a release that merges to main without its `RELEASE_NOTES_vX.Y.Z.md` file goes to prod with the in-app timeline missing that version. There's no runtime fallback because the markdown doesn't ship to Firestore — it ships to the build artefact.

This bit us on v1.5 (PR #26 merged without `RELEASE_NOTES_v1.5.0.md`, prod went out blank for v1.5, required a follow-up docs PR). If you catch yourself writing release notes AFTER the merge, you've already shipped a stale prod — open a tiny follow-up docs PR immediately.

The same applies to `USER_GUIDE_*.md` files going forward — if we wire them into a `/feature-tracking` User Guides tab, that tab will read them at build time too.

---

## "DEPLOY RULES" rule — never silent on `firestore.rules`

If `firestore.rules` changes in this release, the assistant MUST post a 🚨 DEPLOY RULES banner with the full updated rules file BEFORE the dev → main PR opens. Asaf has to copy-paste those into the Firebase Console manually because App Hosting doesn't auto-deploy storage / firestore rules.

Skipped twice in v1.7 → user got "Missing or insufficient permissions" errors → user got rightfully angry. Don't do it again.

---

## "Don't expand release scope mid-cycle" — the v1.7 lesson

v1.7 was planned as 20 pts over 6 stories. It shipped ~30 pts of customer-facing PDF work because each round of feedback got built into v1.7 instead of being parked as v1.7.5 / v1.8.

The pattern that got out of hand: user reports "X looks weird" → assistant fixes X in same dev cycle → user reports "Y is also weird" → assistant fixes Y → loop until ~10 rounds of polish later we realise scope tripled.

**Discipline going forward**:
1. The first round of bug-fix feedback after build-complete: ship in current release.
2. The second round of "would be nice" feedback: defer to vX.Y.Z+1 unless trivial.
3. The third round: hard line — open a NEW status doc for the next release.

The CLAUDE.md "Demand Elegance (Balanced)" rule already covers this in spirit. Be willing to push back at round-3.

---

## "One-shot seed buttons" — the v1.6.2 lesson

When a release includes Firestore data changes (e.g. seeding new stories, retargeting existing ones), the pattern is:

1. Build a seed module (`src/lib/<release>-<purpose>-seed.ts`).
2. Wire it to a one-shot button on the Backlog (or relevant admin surface).
3. User clicks the button → seed runs → toast confirms.
4. **In the same dev cycle**, remove the button + module entirely. Firestore is the canonical state; the seed module becomes dead weight after the click.

If you need to add MORE seeded data after the user has clicked once, that's another seed module + another one-shot button. Don't try to keep one button alive across cycles.

The v1.7 polish-review seed (`src/lib/v17-polish-review-seed.ts` + the green button on the Backlog) is intentionally idempotent and stays — it's the exception, not the rule. The rule is "seed once, remove the button".

---

## How releases get into prod

```
   ┌─────────────────────────────┐
   │ Develop on:                 │
   │ claude/app-overview-wKiZ1   │ ← the canonical dev branch (CLAUDE.md)
   └──────────────┬──────────────┘
                  │ git push
                  ▼
   ┌─────────────────────────────┐
   │ Firebase App Hosting        │
   │ auto-deploys → DEV URL      │ ← test here
   └──────────────┬──────────────┘
                  │ release artefacts (notes + guide + table + handover)
                  │ all on the dev branch
                  ▼
   ┌─────────────────────────────┐
   │ Open dev → main PR (DRAFT)  │
   │ Reviewer signs off          │
   └──────────────┬──────────────┘
                  │ merge
                  ▼
   ┌─────────────────────────────┐
   │ Firebase App Hosting        │
   │ deploys main → PROD         │
   └─────────────────────────────┘
```

After main merge:
1. Update CLAUDE.md release-state table: flip `✅ Shipped to dev` → `✅ Shipped to production. PR #N merged YYYY-MM-DD.`
2. Optional: tag the merge commit with `vX.Y.Z` for easier git archaeology.

---

## Reference: every release-notes file currently shipping in-app

```
tasks/
├── RELEASE_NOTES_v1.0.0.md          (Initial Release)
├── RELEASE_NOTES_v1.1.0.md
├── RELEASE_NOTES_v1.2.0.md
├── RELEASE_NOTES_v1.2.1.md
├── RELEASE_NOTES_v1.3.0.md
├── RELEASE_NOTES_v1.3.1.md
├── RELEASE_NOTES_v1.4.0.md
├── RELEASE_NOTES_v1.5.0.md          (post-merge add — see lesson above)
├── RELEASE_NOTES_v1.5.1.md
├── RELEASE_NOTES_v1.6.0.md
├── RELEASE_NOTES_v1.6.1.md
├── RELEASE_NOTES_v1.6.2.md
└── RELEASE_NOTES_v1.7.0.md          (this release)
```

User guides start with v1.7:

```
tasks/
└── USER_GUIDE_v1.7.0.md             (the new convention starts here)
```

Future releases: every minor + every user-UX patch = a paired notes + guide.
