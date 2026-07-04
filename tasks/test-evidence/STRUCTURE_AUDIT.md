# Structural-Consistency Audit — 2026-07-04

**Scope**: rules coverage · module integrity · type consistency · orphans · duplicate display identity.
**Method**: `scripts/mpf/audit-structure.py` — static scan of `src/` + `firestore.rules`, plus READ-ONLY live Firestore probes as `billh@nsmarine.com.au` (a parent-dealer admin who is **not** a HelmLogic Admin — exactly the user class the v1.9/v1.15 incidents hit). Raw data: `tasks/test-evidence/structure-audit.json`.
**Firestore writes made by this audit: zero.**

At-a-glance: **74 code paths / 6 collectionGroup ids audited** → 6 unruled paths (5 live-probed 403), 3 write gaps, 2 collectionGroup 403s (live-proven), 1 cross-user write conflict, 26 zero-variant ghost models, 0 empty-items DFS, 0 unexplained empty ESS, 101 duplicate serviceParts part numbers, 16 fitUpItems dup-name groups, 2 trailer dup groups, 6 DFS dup groups, 12 serviceOperations dup codes.

---

## Class 1 — RULES COVERAGE (the 403-landmine class)

Every `collection()` / `doc()` / `collectionGroup()` literal in `src/` was normalised and matched against `firestore.rules` match blocks (admin-only `/{document=**}` excluded — it doesn't help non-HelmLogic-admins).

### 1a. Paths referenced in code with NO rule — live-probed as billh

| Path | Writes? | Live probe | Callsites | Surface |
|---|---|---|---|---|
| `organisations/{org}/priceLists` | **yes** | **HTTP 403** | `price-list-viewer.tsx:417`, `price-list-manager.tsx:323,805,822,842` | **LIVE — mounted from `modules/[id]/page.tsx`** |
| `organisations/{org}/serviceQuotes/{id}/sentEmails` | **yes** (awaited `addDoc` in the Send pipeline) | n/a (needs quote id) | `service-quote-detail-sheet.tsx:286,315` | **LIVE — v1.13 service-quote Send breaks for non-admins when `NEXT_PUBLIC_EMAIL_SEND_ENABLED` flips on** |
| `organisations/{org}/priceLevelDefinitions` | yes | HTTP 403 | `price-book-table.tsx:116,136,152,171` | Dormant — `/price-book` page exists but is not nav-linked |
| `organisations/{org}/productPrices` | yes | HTTP 403 | `price-book-table.tsx:122,182,205` | Dormant (same page) |
| `brands` (top-level) | read | HTTP 403 | `price-book-table.tsx:96` | Dormant (same page) |
| `products` (top-level) | read | HTTP 403 | `price-book-table.tsx:108,110` | Dormant (same page) |

### 1b. Write gaps — a rule matches but only allows READ for non-admins

| Path | Code writes at | Matched rule |
|---|---|---|
| `organisations/{org}/serviceQuotes/{id}/auditLog` | `service-quote-detail-sheet.tsx:164,339,348` (status-change + send/lock audit) | only `/{path=**}/auditLog` **read** — `match /serviceQuotes/{quoteId}` does NOT cover subcollections |
| `features/{id}/auditLog` | `suggestion-approval-queue.tsx:58` | only `/{path=**}/auditLog` **read** — `features` block has `comments` but no `auditLog` |
| `dealerFitCategories` | `dealer-fit-options.tsx:61`, `catalog-export-import.tsx:272`, `modules/dealer-fit-options/page.tsx:58,75` | `read: isSignedIn` / `write: isAdmin()` — **isAdmin = HelmLogic Admin**, so org admins like Bill 403 on category create/delete AND on the Audit Workbook import path (v1.6.1 postmortem class) |

### 1c. collectionGroup queries with no recursive-wildcard rule — **live-proven 403**

| collectionId | Probe as billh | Callsites |
|---|---|---|
| `models` | **HTTP 403** | `stock-import.tsx:148`, `delivered-deals-import.tsx:163`, `ai/flows/maritime-assistant-flow.ts:76` |
| `ranges` | **HTTP 403** | `ai/flows/maritime-assistant-flow.ts:59` |

`quotes` / `contracts` / `auditLog` / `variations` all probe OK (their `/{path=**}/X/{id}` rules exist). The path-scoped `data-warehouse/{allPaths=**}` rule does **not** satisfy collectionGroup queries — Firestore requires the recursive-wildcard form. Stock import, delivered-deals import, and the maritime assistant are broken today for every non-HelmLogic-admin.

### 1d. Cross-user write conflict

`users/{userId}/notifications` rule requires `isOwner(userId) || isAdmin()`, but code writes **other users'** notifications: `hold-request-dialog.tsx:174` (notify brand captain), `hold-requests-dashboard.tsx:105` (notify requester), `lib/notifications.ts:9` (generic helper, used for @-mentions). A non-admin salesperson raising a hold request gets a 403 on the notification write.

### 1e. Rules with no code references (informational)

`organisations/{org}/supplierPriceLists` (rule deployed v1.31; collection empty, zero code refs), `users/{uid}/quotes/{qid}/service_items`, `users/{uid}/routes`. Harmless; candidates for cleanup.

---

## Class 2 — MODULE INTEGRITY: ✅ clean

- **`mainVendorId` dangling refs: 0** — all 9 module→vendor pointers resolve (7 boat brands + Yamaha + MPF).
- **Priced Boat Brand vendors without a module: 0** — all 6 priced brands (Stabicraft 37, Stacer 91, Highfield 640, Formosa 30, Surtees 19, Jeanneau 19 priced variants) have modules. Haines Signature has 0 priced variants (gate correctly keeps it placeholder) and also has a module.
- **nav-links routes: 0 missing** — all 15 hrefs in `src/lib/nav-links.ts` resolve to `page.tsx` files.
- **Duplicate module display names: 0** (note: "Trailers" vs "Trailers Module" are distinct strings — cosmetically confusable but not identical).

Brand stats: Stabicraft 7r/40m/37v · Haines 1r/9m/9v (0 priced) · Stacer 10r/91m/91v · Highfield 7r/85m/640v · Formosa 1r/39m/39v (30 priced) · Surtees 5r/21m/19v · Jeanneau 8r/48m/27v (19 priced).

---

## Class 3 — TYPE CONSISTENCY: ✅ no string prices; one date-type convention note

Sampled 50 docs each: boat variants, dealerFitSelections, fitUpItems, serviceParts, riggingKits, serviceOperations, engineServiceSchedules, Yamaha motor rows (raw Firestore value envelopes, so string-vs-number is exact).

- **Price-bearing string fields: 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0.** Every field matching `price|cost|sell|ctd|retail|margin|labour|total|freight|…` is numeric or null. No `'$1,234'` / `'1234'` strings anywhere in the samples.
- **Date-type mixture**: none within any single field. But `importedAt` is an **ISO string (never a Firestore timestamp)** on all 6 MPF-imported org collections (dealerFitSelections, fitUpItems, serviceParts, riggingKits, serviceOperations, engineServiceSchedules) — consistent, but any future `orderBy('importedAt')`/timestamp comparison code must treat it as a string. Convention note, not a violation.

---

## Class 4 — ORPHANS

- **Models with zero variants: 26** (unquotable ghosts — they render in ModelsGrid but the quote-page variant probe keeps them placeholder): **Jeanneau 21** (of its 48 models — most of the brand), **Stabicraft 3** (`tet` [test junk?], `2750`, `2350`), **Surtees 2** (`770`, `800`). Full paths in `structure-audit.json → class4_orphans.modelsWithZeroVariants`.
- **Variants under nameless models: 0.**
- **dealerFitSelections with empty/missing `items[]`: 0 / 1,791.** ✅
- **engineServiceSchedules with empty `intervals`: 32 / 189 — ALL carry `legacyNoPricing: true`** (deliberate MPF-import flag); **0 unexplained**. ✅

---

## Class 5 — DUPLICATE DISPLAY IDENTITY (what a user sees twice in a picker)

- **Motors (Yamaha, 235 rows): 0** dup display names with differing price. 20 duplicate `MODEL CODE` natural keys exist (e.g. `F90XB` = "F90XB" + "F90XB (Tiller)") but displays are distinct and prices identical — informational only; matters if an import ever upserts by MODEL CODE.
- **Trailers (497 rows): 2** — `MACKAY MLJ6000T-14-HB` ($18,400 vs $21,400, ids 8003/8005) and `MACKAY PU5000-14-M` ($8,030 vs $9,760, ids 8126/8128). A user picking by name can grab the wrong price.
- **fitUpItems (3,660): 16 groups** — worst: 7× "DISCONTINUED - No Longer Available" ($1,669–$6,279 — junk display names that should carry the real item name); pairs like `Boat Cover - SP360` ($990 vs $750), `Towpost - SP520` ($1,420 vs $1,900), `Sundeck - SP520` ($1,090 vs $1,050).
- **serviceOperations (364): 0** name dups; **12 duplicate `code` groups** (truncated/generic codes: `DFO_` ×34, `DFO-TRA-` ×20, `DFO-GEN` ×7, `Sublet` ×7, `Factory` ×6…) — code is not usable as a natural key as-is.
- **serviceParts (26,345): 101 duplicate part numbers** (the import natural key!) with differing prices — e.g. `293714` ×3 ($1.77 / $380.91 / $1,100), `MISC` ×3, `FREIGHT` ×2. An upsert-by-partNumber re-import will collapse or mis-patch these. Also 1,115 name-dup groups, but parts names are generic descriptors (`SCREW` ×341, `GASKET` ×307…) and the picker shows partNumber — mostly benign noise; the partNumber dups are the real issue.
- **dealerFitSelections (1,791 items): 6 groups** — all Helm Master EX rig descriptions where two distinct SKUs (`…hbs…` vs `…hbt…`, both `-nla`) share one display name with ~$250 price gaps.
- **riggingKits: 0** duplicate part numbers. **Boat variants: 0** same-model display dups (name+material is the card identity; name-only "dups" are the legit PVC/HYP ladder).

---

## Handoffs (all fixes are OUT of audit scope — this audit changed no code, no rules, no data)

| # | Pri | Fix | Owner surface |
|---|---|---|---|
| H1 | P0 | Add rules for `organisations/{org}/priceLists` (live 403 on the module price-list surface) + `serviceQuotes/{id}/sentEmails` & nested `auditLog` (make `serviceQuotes/{quoteId}` block cover subcollections or add explicit matches) — full-file paste + post-publish spot-check per CLAUDE.md | firestore.rules |
| H2 | P0 | collectionGroup `models` + `ranges`: add `/{path=**}/models/{id}` + `/{path=**}/ranges/{id}` read rules, or rewrite the 4 callsites to path-scoped queries (stock-import, delivered-deals-import, maritime-assistant) | firestore.rules or src |
| H3 | P1 | `dealerFitCategories` write is HelmLogic-admin-only but org-admin surfaces write it (incl. Audit Workbook import) — decide: relax rule or gate UI | firestore.rules / src |
| H4 | P1 | Cross-user notification writes (hold requests, @-mentions) 403 for non-admins — route via a rule allowing `create` by any signed-in user on `users/*/notifications`, or a server-side writer | firestore.rules / src |
| H5 | P1 | `features/{id}/auditLog` write in suggestion-approval-queue has no write rule | firestore.rules |
| H6 | P1 | serviceParts: 101 duplicate partNumbers with differing prices — dedupe/reconcile before any upsert-by-key re-import | data fix (scripted) |
| H7 | P2 | 26 zero-variant ghost models (Jeanneau 21, Stabicraft 3 incl. `tet` test doc, Surtees 2) — seed variants or hide/delete | data fix |
| H8 | P2 | Picker dup identities: 2 MACKAY trailers, 16 fitUpItems groups (esp. 7 "DISCONTINUED" placeholders), 6 Helm Master DFS pairs — rename or merge | data fix |
| H9 | P3 | Decide fate of dormant `/price-book` page (`brands`/`products`/`priceLevelDefinitions`/`productPrices` all unruled + 403) — delete page or add rules | src cleanup |
| H10 | P3 | `importedAt` is an ISO string on all MPF collections — document convention; never `orderBy` it as a timestamp | docs/CONVENTIONS |

Re-run: `python3 scripts/mpf/audit-structure.py` (read-only, ~4 min).
