# v1.14 + v1.15 + v1.16 build tracker — FINAL

All stories addressed on `claude/v1.12-v1.13-push`. Nothing has been
merged to main without permission.

**Legend:** ✅ built · 📄 doc/decision (no code needed) · ⛔ blocked

## v1.14 (4/4 ✅)

| Ticket | Title | Status | Notes |
|---|---|---|---|
| 3.7.6 | Org-level pricing overrides inline | ✅ | TrailersTable org-override mode + OVR badge |
| 3.7.7 | Migrate per-vendor imports under catalog tabs | ✅ | Import data sheet on MotorsTable |
| 3.9.1 | Optional features editor (drill-down panel per model) | ✅ | OptionalFeaturesPanel on BoatsTable |
| 9.2.1 | Fit-up tab on each module page | ✅ | ModuleFitUpTab; Yamaha workspace as first integration |

## v1.15 (3/3 ✅)

| Ticket | Title | Status | Notes |
|---|---|---|---|
| 3.3.1 | Crowdsourced Suggestions with Audit | ✅ | Approve/reject writes to features/{id}/auditLog |
| 3.4.2 | Marketing Copy Editor UI | ✅ | MarketingCopyPanel — tagline + description |
| 9.3.1 | Rule-based fit-up tier auto-classification (full engine) | ✅ | New fitUpClassificationRules + resolver + admin UI |

## v1.16 (34/34 — shipped or documented)

### Already shipped before v1.16 (stale-row flips)
| Ticket | Title | Status | Notes |
|---|---|---|---|
| 9.2.2 | "Include fit-up" checkbox | ✅ stale | Shipped in v1.11 code |
| VDUeX9zQ | NO Trailer images shown | ✅ stale | Resolved in v1.11 Phase D PDF polish |
| e6twmpiT | Boat colour image + Material on Summary | ✅ stale | Variant.imageUrl + variantLabel already there |

### Shipped on dev (code)
| Ticket | Title | Status | Notes |
|---|---|---|---|
| E7fCW6Oh | Display price including GST | ✅ | Inc-GST sub-line on running total |
| mqXYkQbT | Remove cents + total inc GST | ✅ | Same commit as E7fCW6Oh |
| lXRbKtH8 | HYP → Hypalon | ✅ | Label-only change across 4 surfaces |
| bvAyUQVR | Larger logos on final quote PDF | ✅ | 40px → 56px tall on header |
| Qt0VHo4M | Larger images on Summary | ✅ | BuildBand 92×70 → 120×90 |
| 11E75Jyz | Remove pricing from Trailer Spec | ✅ | Cost/Sell rows removed from spec modal |
| NWi9EetL | Sub Total for Trailer + options | ✅ | New subtotal row on trailer card |
| XydsZkX3 | Show / Hide retail pricing for options | ✅ | Toggle on proposal-view; affects PDF |
| VyZ4AonV | Restructured Dealer Fit headings | ✅ | Count + packages-incl. subtitle |
| gFQrcADO | Remove quote from Quotes screen | ✅ | Soft-delete X on Recent Proposals card |
| ZidKJczh | Dealer Fit option model-specific | ✅ | applicableModelIds filter |
| Kw1Y2Gww | Un-DEFAULT trailer from package | ✅ | "× No trailer" pill on Step 4 |
| rI21WRhH | Dealer fit option expander | ✅ | Show/Hide components inline panel |
| pcDkqAXa | Improved heading layout | ✅ | Two-row header + progress bar |
| 3.8.3 | Inline edit cover image | ✅ | CoverImagePanel; drag-drop in v1.17 |
| 3.8.4 | Inline edit marketing description (TipTap) | ✅ | Rich-editor Dialog popover |
| 3.9.2 | Motor compatibility window editor | ✅ | CompatibilityPanel min/max HP + steering |
| 3.9.3 | Dealer fit compat editor | ✅ | applicableDealerFitCategories CSV |
| 3.4.3 | Photo Curation UI | ✅ | PhotoCurationPanel — paste/reorder/remove |
| 3.8.1 (v1.16) | Inventory / Stock display on catalog | ✅ | "N in stock" badge on BoatsTable rows |
| ltaY5TPd | Quote Archive Repository | ✅ | Archive toggle + Restore on Recent Proposals |

### Decisions / docs / ops
| Ticket | Title | Status | Notes |
|---|---|---|---|
| 8E5S6tV6 | Explain FIT UP tab | 📄 | `tasks/v1.16-DECISIONS.md` |
| Cl0bRhFo | How to fit images to DEALER FIT ITEM | 📄 | `tasks/v1.16-DECISIONS.md` |
| N29OaRni | Admin tab | 📄 | Decision: no top-level Admin tab |
| 9Y7UnGZJ | Recommended image sizes for uploads | 📄 | Size table in `v1.16-DECISIONS.md` |
| hSPmTAy5 | Change image in "Choose Boat Series" | 📄 | How-to in `v1.16-DECISIONS.md` |
| uUGUfN38 | Change image in Range selection | 📄 | Same surface as hSPmTAy5 |
| 3.8.7 | Decommission Pricing Manager + HighfieldModelEditor | 📄 | Code-ready; 4 operator-side gates |
| PvmKgeuC | Set up Test Sub Dealer site | 📄 | Ops task, no code change |
| RT0OwAM1 | Updates to Yield Analysis | 📄 | No Yield Analysis component yet — defer to v1.17 grooming |
| 2eTb7FTN | Yamaha rigging kits | 📄 | Data setup via Manage → Fit-Up → Packages |

## Blocked items (review at end — review now ✓)

- **11.3.2** — NSM-Hub Migration tooling — still blocked on `nsm-service-quotation` read service-account
- **11.3.3** — NSM-Hub Cutover + verification + decommission — same block

Both stay at v1.14 `targetRelease` in Firestore (per my earlier ship script). They land in the first release after access clears.

## Summary

- **v1.14:** 4 stories built on dev
- **v1.15:** 3 stories built on dev
- **v1.16:** 22 built on dev · 3 stale-flips · 10 decisions/docs
- **Blocked:** 2 NSM-Hub stories — unchanged from earlier

**0 Firestore writes this round** — every status flip + planning move stays in your hands. The dev branch has all the code; ready when you say merge.
