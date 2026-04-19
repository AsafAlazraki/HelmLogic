# HelmLogic — Codebase Map

> File-by-file index for fast orientation. Updated: 2026-04-19.
> 81 components + 10 lib files + 9 test specs. Most important files are starred ★.

---

## App Routes (`src/app/(app)/`)

| Path | Purpose |
|------|---------|
| `layout.tsx` | Top-level app shell (sidebar, header, auth gate) |
| `dashboard/` | Home dashboard after login |
| `modules/[id]/page.tsx` ★ | **Module workspace — ~1400 lines, most complex file.** Routes by moduleType: catalog → default tabs, motor-brand → YamahaMotorWorkspace, master-price-file → MasterPriceFileWorkspace, placeholders → placeholder view, sub-dealer → separate tabs. |
| `modules/add/page.tsx` | New module creation form (moduleType selector) |
| `modules/dealer-fit-options/` | Admin: global dealer fit categories |
| `modules/page.tsx` | Module list / picker |
| `admin/` | Admin-only pages (user list, organisations, agent-team, global dealer fit) |
| `organisations/` | Org management |
| `manage/` | Org settings (permissions, roles, dealer fit selections) |
| `[orgSlug]/` | Dynamic org-scoped routes |
| `highfield/`, `data-warehouse/`, `vendor-data/` | Data explorers |
| `proposals/` | Proposal preview routes |
| `pricing-manager/` | Global pricing workspace route |
| `price-book/` | Published price book view |
| `reporting/`, `real-time-tracking/`, `route-optimization/`, `sub-dealers/`, `data-connect/` | Feature pages |

---

## Components (`src/components/`)

### Module Workspaces (The Big 4)
| File | Purpose |
|------|---------|
| `yamaha-motor-workspace.tsx` ★ | Motor module workspace — Catalog / Pricing Manager / Promotions / Settings tabs. Reference pattern for TrailersWorkspace. |
| `master-price-file-workspace.tsx` ★ | Editable data tables, Excel import/export, per-sheet datasets. Reused inside other workspaces. |
| `highfield-model-editor.tsx` ★ | Full boat model editor (opened from catalog). Tabs: Overview, Variants, Optional Features, Motor Options, Trailer Config (v1.4: + Trailer Options). |
| `stock-management-workspace.tsx` ★ | Stock + delivered-deals + hold-requests + map + assignments. Sub-tab URL sync. |

### Quote Builder
| File | Purpose |
|------|---------|
| `highfield-quote-flow.tsx` ★ | 6-step quote wizard (Variant → Motor → Dealer Fit → Trailer → Accessories → Review). Most actively edited file. |
| `finalize-quote-dialog.tsx` | Snapshot all prices at save time. `buildQuotePayload()` locks pricing. |
| `proposal-view.tsx`, `proposal-pdf.tsx`, `proposal-print.tsx` | Read finalized quote → render HTML/PDF/print |
| `motor-options.tsx`, `motor-module-browser.tsx`, `motor-configuration-details.tsx` | Motor selection components |
| `trailer-options.tsx` | Current trailer picker (v1.3 — gets rewritten in v1.4) |

### Pricing
| File | Purpose |
|------|---------|
| `highfield-pricing-workspace.tsx` | Per-vendor pricing workspace with margin calc + price levels |
| `module-pricing-dashboard.tsx` | Entry from module settings |
| `price-book-table.tsx` | Published price book display |
| `price-list-manager.tsx`, `price-list-viewer.tsx` | Sub-dealer price list mgmt + view |
| `exchange-rate-manager.tsx` | USD → AUD conversion config |

### Dealer Fit
| File | Purpose |
|------|---------|
| `dealer-fit-options.tsx` | Merges 3 category sources (global + module + motor). Renders selector grids. |
| `module-dealer-fit-manager.tsx` | Per-module category CRUD. `fieldName` prop lets it handle standard / motor / trailer categories. |
| `master-data-browser-dialog.tsx` | Search all MPF datasets → add dealer fit items. One-click add, staged items panel. |

### Stock
| File | Purpose |
|------|---------|
| `inventory-list.tsx`, `stock-list.tsx` | Stock tables. Firestore `in` query capped at 30 (sliced). |
| `stock-item-detail.tsx` | Full stock detail panel (mini-proposal, dealer audit, cost breakdown) |
| `stock-item-form.tsx` | Add/edit stock item |
| `stock-import.tsx`, `stock-export.tsx` | Excel import/export with multi-field dedupe |
| `stock-assignment-view.tsx` | Sub-dealer stock distribution |
| `stock-location-manager.tsx`, `stock-location-map.tsx`, `stock-location-map-leaflet.tsx` | Location mgmt + map views |
| `delivered-deals.tsx`, `delivered-deal-detail.tsx`, `delivered-deals-import.tsx`, `delivered-deals-export.tsx` | Delivered deals workflow |
| `move-to-delivered.tsx` | In Stock - Sold → Delivered transition |
| `hold-requests-dashboard.tsx`, `hold-request-dialog.tsx` | Sub-dealer → parent org hold request workflow |
| `vessel-on-order-list.tsx` | On Order sub-view |

### Customer + Module Settings
| File | Purpose |
|------|---------|
| `customer-list.tsx`, `customer-picker.tsx` | Customer CRUD + picker for sold stock |
| `organisation-module-config.tsx` | Full module settings form |
| `module-role-assignment.tsx` | Brand Captain + Module Manager pickers |
| `module-promotions.tsx` | Promotion CRUD (fixed/per-hp/percentage/category-discount) |
| `module-vendor-access-dialog.tsx` | Associate vendors to module |
| `manage-organisation-page.tsx` | Org-level permissions + role mgmt |

### Brand-Specific (Legacy / Placeholder)
| File | Purpose |
|------|---------|
| `jeanneau-*`, `stabicraft-*`, `stacer-*`, `surtees-*` | Non-Highfield brand stubs — present but unused in active flow |
| `highfield-data-structure.tsx` | Highfield data tree explorer |

### UI + Misc
| File | Purpose |
|------|---------|
| `ui/` | shadcn/ui primitives (Button, Input, Dialog, Tabs, etc.) |
| `header.tsx`, `app-sidebar.tsx`, `user-menu.tsx`, `notification-bell.tsx` | App chrome |
| `helmlogic-loading.tsx` | "Initializing Precision Build" loading component (MUST be scoped, see v1.3.1) |
| `logo.tsx`, `sidebar-skeleton.tsx`, `dashboard-chart.tsx` | Visuals |
| `chat-bot.tsx` | Genkit AI chatbot |
| `route-optimization-form.tsx`, `map.tsx` | Delivery route planning |
| `agent-team-dashboard.tsx`, `org-chart-node.tsx`, `role-hierarchy-chart.tsx` | Agent team / org chart visualizers |
| `FirebaseErrorListener.tsx` | Global Firestore error toast wrapper |
| `admin-guard.tsx` | Admin-only route gate |
| `breadcrumb-nav.tsx` | Breadcrumbs |
| `sam-allen-*`, `yamaha-api-fetcher.tsx`, `json-data-visualizer.tsx` | Data import + inspection tools |
| `mpf-parsers.ts` | Excel sheet parsers for MPF import |

---

## Libs (`src/lib/`)

| File | Purpose |
|------|---------|
| `quote-financials.ts` ★ | `buildQuoteFinancials()` — MUST be passed to `ProposalPDFDocument`. Single source of truth for totals, GST, margins. |
| `currency-utils.ts` | `formatCurrency()` (auto-drops .00 for whole dollars), `getPriceForLevel()`, `resolvePrice()` |
| `hold-request-types.ts` | Hold request enum + type helpers |
| `layout-utils.ts` | Shared layout constants |
| `nav-links.ts` | Sidebar nav definitions |
| `notifications.ts` | Toast wrappers |
| `placeholder-images.json/.ts` | Image fallbacks |
| `utils.ts` | `cn()` classname helper + misc |

---

## Hooks (`src/hooks/`)

| File | Purpose |
|------|---------|
| `use-mobile.tsx` | Mobile breakpoint detection |
| `use-toast.ts` | Toast system |

**Not here but used heavily**: `useDoc`, `useCollection`, `useMemoFirebase` — these come from the Firebase firebase-kit package. `useMemoFirebase` is REQUIRED for memoizing Firestore refs — `useMemo` causes infinite re-renders.

---

## Tests (`tests/`)

| File | Purpose |
|------|---------|
| `critical-paths.spec.ts` ★ | Smoke tests. MUST pass for any deploy. |
| `hotfixes-v1.3.spec.ts` ★ | Regression tests for v1.3 eve-of-release bugs + v1.3.1 URL partial-param bugs |
| `persistence.spec.ts` ★ | Save-then-reload roundtrips. Most valuable file — catches "UI appears to succeed but nothing persisted" class of bugs. |
| `quote-builder.spec.ts` | 6-step quote flow |
| `stock-management.spec.ts` | Stock workspace sub-tabs |
| `settings.spec.ts` | Module settings CRUD |
| `yamaha-motors.spec.ts` | Yamaha workspace |
| `v1.2-features.spec.ts` | v1.2 regression |
| `helpers/utils.ts` ★ | `waitForToast`, `reloadAndAssert`, `openTab`, `assertNoCrash`, `openFirstModelEditor`, `waitForFirestoreSettle`, `getUrlParam` |

---

## Configs (root)

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Workflow rules + known lessons |
| `apphosting.yaml` | Firebase App Hosting config |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Firebase config — rules need manual deploy |
| `playwright.config.ts` | Playwright config (`ignoreHTTPSErrors: true` for sandboxed runs) |
| `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs` | Next.js + TS + Tailwind |
| `components.json` | shadcn/ui config |
| `package.json` | Scripts: `dev`, `build`, `test:e2e`, `test:e2e:smoke`, `test:e2e:list` |

---

## Docs (`tasks/` + `.agents/` + `testing/`)

| File | Purpose |
|------|---------|
| `tasks/START_HERE.md` ★ | NEW SESSION ENTRY POINT. Read this first. |
| `tasks/SESSION_HANDOVER.md` ★ | Deep technical context: data hierarchy, IDs, architecture. |
| `.agents/evolution.md` ★ | Session history + architectural reasoning across releases. |
| `tasks/CODEBASE_MAP.md` | This file. |
| `tasks/v1.4-trailers-module-status.md` | Live state of current release work. |
| `tasks/v1.4-trailers-module-design.md` | Design doc for v1.4. |
| `tasks/v1.3-backlog.md` | v1.3 client requirements (shipped). |
| `tasks/RELEASE_NOTES_v*.md` | Per-release changelogs (v1, v1.1, v1.2, v1.2.1, v1.3, v1.3.1). |
| `tasks/release-notes.md` | Currently stale — superseded by per-version files. |
| `tasks/sprint.md` | Sprint planning (may be stale). |
| `tasks/TEST_CASES.md`, `TEST_RESULTS_LOG.md` | Legacy test docs (superseded by `testing/` folder). |
| `testing/README.md` ★ | Test philosophy + quality rules. |
| `testing/HANDBOOK.md` | Full QA onboarding doc (~42KB, 11 parts). |
| `testing/v1.2/`, `testing/v1.3/` etc | Per-release test plans + cases + results. |
| `testing/shared/bug-report-template.md`, `test-case-template.md` | Templates. |

---

## Scripts (`scripts/`)

Python seed + migration scripts. Note: `seed-highfield.py` writes to the WRONG path (`data-warehouse/highfield`) — use `reseed-correct-vendor.py` which targets `LafOLpLb6QIFE856TiD4`.

---

## Data Import (`data-import/`)

Excel source files used for module imports:
- `Dealer_Fit_Module.xlsx` — dealer fit items master
- `Copy of Motor Module.xlsx` — Yamaha motor data
- `Parts Module (1).xlsx`, `Parts Module (2).xlsx` — parts data
- `Rigging Module.xlsx` — rigging kits
- **`Trailer Module.xlsx`** — PENDING (user needs to drop this in from `C:\Users\AsafA\Downloads\`)

---

## Key Cross-Cutting Concerns

### State that must sync to URL (via `window.history.replaceState`)
- `modules/[id]/page.tsx`: `?tab=`, `?view=`, `?range=`, `?model=` (v1.3)
- `yamaha-motor-workspace.tsx`: `?motorTab=` (v1.3)
- `stock-management-workspace.tsx`: `?stockView=` (v1.3)
- **v1.4 additions**: Trailers workspace will need `?trailerBrand=`, `?trailerTab=`

### Loading overlays (MUST be scoped per v1.3.1)
- `modules/[id]/page.tsx`: `{isTransitioning || (view === 'bmt' && (masterModelLoading || overrideLoading))}` — NOT page-root
- Apply same pattern to TrailersWorkspace when built

### Zod schemas (MUST be permissive for legacy data)
- `highfield-model-editor.tsx` / `model-configuration-editor.tsx`: every field `optional().nullable().default()`, every object `.passthrough()`
- Same for any new trailer schemas in v1.4

---

**Keep this map current. When you add/remove/rename components, update this doc in the same commit.**
