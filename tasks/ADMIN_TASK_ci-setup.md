# ADMIN TASK — CI Setup (GitHub Actions)

**Status: workflow authored (`.github/workflows/ci.yml`), needs Actions enabled + one decision (typecheck hard gate timing).**
Audience: repo admin. Companion files: `tasks/test-evidence/history/HISTORY.md` (nightly evidence ledger).

---

## What the workflow does

`.github/workflows/ci.yml` defines two jobs, both capped at 30 minutes, with a concurrency
group that cancels superseded runs (a new push cancels the stale in-flight run for the same ref).

### Job 1 — `gate` (every push to `claude/app-overview-wKiZ1` + every PR into `main`)
1. `npm ci` on Node 20 (npm cache enabled).
2. `npm run typecheck` — **soft gate for now** (`continue-on-error: true`). tsc has pre-existing
   errors (firebase/storage `Storage` export, `@react-pdf` `Style` vs `Styles`, es2018 regex flags
   in test specs), so a hard gate today would block every merge on old debt. A warning annotation
   + step summary is emitted on every run so the failure stays visible.
3. Unit tests — runs `npm run test:unit` only if `vitest.config.ts` exists; there is no unit suite
   yet, so this step self-skips gracefully and becomes real the day a vitest config lands.
4. `npm run build` — **hard gate**. A broken build fails the run, full stop.

### Job 2 — `synthetic` (nightly cron `0 18 * * *` ≈ 4:00am AEST, + manual `workflow_dispatch`)
1. Checks out the dev branch (`claude/app-overview-wKiZ1`) — scheduled runs fire on the default
   branch, but the synthetic pass and its evidence belong on dev.
2. `npm ci` → `npm run build` → boots the production server (`next start -p 9002`) and waits on
   `http://localhost:9002/login`.
3. Runs `SMOKE_APP_URL=http://localhost:9002 python3 scripts/smoke-1000.py` (~2,000 checks against
   the live Firestore project + the running app).
4. **Result gate**: the smoke script exits 0 even when checks fail (it only writes evidence), so the
   job parses `test-results/smoke-data.json` and fails if `failed != 0`.
5. Uploads `smoke-data.json` as a run artifact, copies it to
   `tasks/test-evidence/history/YYYY-MM-DD-<sha>.json`, appends a row (date / commit / passed-total /
   failed) to `tasks/test-evidence/history/HISTORY.md`, and commits both back to the branch as
   `github-actions[bot]` with `[skip ci]` in the message (so the evidence commit doesn't trigger CI).

**Why this matters**: the scheduled synthetic job is the "testing happens without anyone asking"
guarantee. Nobody has to remember to run the smoke pass — every morning there is either a green run
+ a fresh history row, or a red run that names the day the app broke.

## One-time setup

1. **Enable Actions on the repo**: GitHub → repo → Settings → Actions → General → "Allow all actions
   and reusable workflows". Nothing runs until this is on.
2. **Allow the bot to push**: same page, under "Workflow permissions", select **Read and write
   permissions** (the synthetic job also declares `permissions: contents: write`, but the repo-level
   setting must not be read-only). If the dev branch ever gets a protection rule, exempt
   `github-actions[bot]` or the history commit will be rejected.
3. **No secrets needed today**: the smoke script talks to Firestore via the public web API key that
   is already in the repo/build. If the build ever starts requiring private env vars, add them as
   Actions secrets and thread them into the `Build` steps.

## Flipping typecheck to a hard gate

When `npm run typecheck` is green locally (T1 — clearing the tsc debt):
1. Edit `.github/workflows/ci.yml`, find the `Typecheck (soft gate — see TODO above)` step.
2. Delete the `continue-on-error: true` line (and optionally the now-redundant
   `Typecheck summary annotation` step + the TODO comment block).
3. Done — from then on a type error fails the `gate` job.

## Adding Sentry (external account — steps only, nothing wired yet)

1. Create a Sentry org/project (platform: Next.js) at sentry.io — needs a stakeholder-owned account.
2. `npm install @sentry/nextjs` then `npx @sentry/wizard@latest -i nextjs` on the dev branch — this
   scaffolds `sentry.client/server/edge.config.ts` and wraps `next.config`.
3. Put the DSN in `NEXT_PUBLIC_SENTRY_DSN` (App Hosting env + local `.env`), and add
   `SENTRY_AUTH_TOKEN` as a GitHub Actions secret so the build can upload source maps.
4. Gate it like email/SharePoint: only initialise Sentry when the DSN env var is present, so dev
   builds without the secret stay clean.
5. Optional: add a Sentry alert rule → email/Slack so prod exceptions page a human.

## Operations notes

- **Manual synthetic run**: Actions tab → "CI" → "Run workflow" (this triggers only the `synthetic`
  job; `gate` only runs on push/PR).
- **Evidence trail**: `tasks/test-evidence/history/HISTORY.md` is the at-a-glance ledger; the
  per-day JSON beside it is the full check-by-check record; the same JSON is also attached to each
  run as an artifact (kept per repo retention settings).
- **Cron is UTC**: `0 18 * * *` = 4:00am Brisbane (AEST, no DST). If the team moves to a DST state,
  revisit.
