# Synthetic Smoke History

One row per synthetic smoke-1000 run. Rows are appended automatically by the
nightly `synthetic` job in `.github/workflows/ci.yml`; each row's full evidence
JSON is saved beside this file as `YYYY-MM-DD-<sha>.json`.

| Date | Commit | Passed / Total | Failed |
|---|---|---|---|
| 2026-07-03 | `00413d5` | 2076 / 2076 | 0 |
| 2026-07-05 | `40a44bf` | 34580 / 34594 | 14 (all standing-explained: 2 NSM negative-sell rows + 12 documented menu skips) |
| 2026-07-05 | `c6067aa` | 34580 / 34594 | 14 (standing-explained; release-tip run for the v1.18 → v1.31 merge) |
