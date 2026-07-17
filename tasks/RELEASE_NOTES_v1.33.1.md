# HelmLogic — Release Notes v1.33.1

**Date:** 2026-07-15 · **Branch:** `claude/app-overview-wKiZ1` → `main` · Patch release (fractional, like v1.5.1 / v1.6.1)

## Release Stats

- **1 customer-facing fix**: the fit-up quote picker now honours the sanctioned `hidden` flag — negative-price MPF CREDIT/deduction lines can no longer be offered on a quote
- **2 new nightly battery sections** (M + N): the FFR-33 guarantees are now self-enforcing instead of manually re-proven
- **1 nightly-killing crash fixed**: the battery died on extract-less checkouts (every CI run) before writing results
- **Gates**: TypeScript clean · full battery **32,579/32,579 PASSED** on the shipped commit · zero schema or rules changes — nothing to publish post-merge

## 1. Fit-up picker honours the hidden class

The v1.31 sanctioned hide class (`{hidden: true, hiddenReason}` on negative-price MPF deduction lines) was write-only — no consumer ever filtered it. Nightly section E flagged two live CREDIT lines ("CREDIT - Batteries (2 x MFM70)" −$519, "CREDIT - Battery Switch" −$115); both are now hidden with provenance, and `fit-up-quote-selector.tsx` actually filters `hidden` items so the class can never reach a customer-facing picker again. Section E exempts the hidden class going forward.

## 2. Nightly battery sections M + N (FFR-33 made self-enforcing)

- **M — Display-Sheet composition inputs, every boat.** Walks all 809 MPF variants nightly: PD tier 1 priced (809/809), inc-GST hull price (809/809), every motor-slot rigging kit resolving to a priced org kit, every slot prop resolving in serviceParts with a usable price. Understands the MPF's own signifier grammar (`NR` / tiller / factory-fit no-kit markers; `xx`-wildcard, dual-option and supplied-with-motor prop placeholders — see `tasks/mpf-boat-page-signifiers.md`).
- **N — override drift alarm.** The SP560 root cause (org `modelOverrides` silently shadowing catalog prices) is diffed nightly across every override doc: optionalFeature prices, model sell/cost, variantOverrides. 0 shadows today; any reappearance fails the nightly the same day.
- **Known-gaps ratchet** (`tasks/mpf-audit/known-gaps-composition.json`): the standing day-1 gaps — **31 non-Highfield rigging-kit names + 1 prop part number that don't resolve** — are committed as an allowlist. Anything NEW fails the run; the standing count prints nightly; shrinking the file is the visible v1.34 mapping backlog.
- **Crash fix**: section K referenced live inputs that were only hydrated when the gitignored MPF extracts exist — on fresh checkouts (nightly CI) the battery died with a NameError before writing results. The extract-less branch now hydrates the live inputs so every live check always runs.

## 3. Roadmap hygiene

Story 3.10.5 (product-image acquisition pipeline) was stranded `planned` on shipped v1.32 — retargeted to v1.34. Caught by nightly section H.

## Not in v1.33.1

No new operator surfaces (no user-guide delta). The 31-kit mapping work, the image pipeline, PD tier 2/3 picker and grid-motor bundles are the v1.34 queue.

## Files Changed

11 files, +320/−107: `scripts/smoke-1000.py` (sections M + N, K crash fix, E hidden exemption), `src/components/fit-up-quote-selector.tsx` (hidden filter), `tasks/mpf-audit/known-gaps-composition.json` (ratchet allowlist), `tasks/EMAIL_release_update_v133.html` (team email draft), config-tabs probe evidence refresh.
