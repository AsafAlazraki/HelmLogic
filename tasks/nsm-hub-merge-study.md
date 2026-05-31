# NSM-Hub → HelmLogic — Merge Study (findings)

> Study pass on `github.com/AsafAlazraki/NSM-Hub` (made public for this review). Captures what NSM-Hub is, where it overlaps + extends HelmLogic, and the hard constraints that shape the merge. Direction decision is a separate gate — see "Strategic fork" at the end.
>
> **Source fidelity note**: studied via GitHub web (raw files + tree listings), not a local clone — the sandbox network can't reach github.com from the shell. `package.json`, `docs/blueprint.md`, `src/lib/firebase.ts`, `src/lib/types.ts`, and the `src/app` + `src/components` + `src/lib` trees were read. Individual page/component bodies were NOT read in depth yet — maturity is inferred from the data model + route surface.

---

## What NSM-Hub is

A **dealership-operations hub for Northside Marine** (NSM = HelmLogic's primary client). The `docs/blueprint.md` seed describes a "marine service quotation tool," but the app has grown well past that into a broad platform spanning quoting, service, bookings, diagnostics, insurance, CRM, and catalogue management.

**Route surface (`src/app`)**: `admin-config` · `api` · `boat-management` · `bookings` · `booking-application/[accessKey]` · `catalogue` · `customers` · `dealership-management` · `highfield-cpq` · `insurance-quotes/dashboard` · `kits` · `login` · `new-quote` · `quote/[id]` · `sales-hub` · `service-hub` · `staff` · `yamaha-diagnostics`

**Component modules (`src/components`)**: `bmt-quote`, `boat-management/checklists`, `booking`, `customers`, `dashboard`, `form`, `highfield-cpq`, `kits`, `staff`, `yamaha-diagnostics`, plus `ui/` (shadcn) and root components (Header, Logo, QuoteCard, QuoteView, UserProfileDialog).

This is a mid-to-large app with a rich, well-developed data model — not a boilerplate.

---

## Tech stack vs HelmLogic

| | NSM-Hub | HelmLogic | Risk |
|---|---|---|---|
| Next.js | **15.5** | 14 | Async `cookies()/headers()/params` breaking changes |
| React | **19.2** | 18 | Hook/ref/`use()` breaking changes |
| Tailwind | **4.1** (CSS-config, `input.css`) | 3 | Config-format rewrite; class differences |
| UI kit | shadcn/Radix | shadcn/Radix | ✅ same |
| Forms | react-hook-form + zod | react-hook-form + zod | ✅ same |
| AI | Genkit (`@genkit-ai/google-genai`) | Genkit | ✅ same |
| Drag-drop | `@hello-pangea/dnd` | `@dnd-kit` | Different lib |
| Spreadsheet | `xlsx` | `xlsx` | ✅ same |
| PDF | `pdf-parse` (reads PDFs) | `@react-pdf/renderer` (writes PDFs) | Complementary |
| Charts | `recharts` | — | New |
| Firebase | `firebase ^12` | `firebase` | Same SDK family |

**The version skew is the #1 technical risk.** Components don't copy cleanly in either direction — porting NSM-Hub→HL is a React19→18 + Tailwind4→3 downgrade; porting HL→NSM-Hub is upgrading 9 releases of HL code to the newer stack.

---

## 🚨 Hard constraint: separate Firebase projects

- **NSM-Hub** → `nsm-service-quotation`
- **HelmLogic** → its own project

They have **separate Firestore databases**. A real merge means **data consolidation**, not just code consolidation. Also notable: NSM-Hub's `src/lib/firebase.ts` initialises **Firestore only** — no `getAuth()`. Its auth model (the `login/` route, `userId`/`UserProfile`) looks thinner than HelmLogic's Firebase Auth + `organisations/{orgId}` + role-permissions model.

---

## Overlap + extension map

### Deep overlap — both are Highfield BMT CPQ systems (convergent designs)

NSM-Hub's catalogue + `BMTQuote` model is strikingly parallel to HelmLogic's `data-warehouse` + quote flow:

| NSM-Hub | HelmLogic |
|---|---|
| `BoatBrand → BoatRange → BoatModel` + `pricing[]` (material×color×price) | `data-warehouse/{vendor}/ranges/{range}/models/{model}/variants` |
| `CatalogueMotor` + `Propeller` (basePrice/sellPrice/gp%/nsmCode) | Yamaha motor module + `priceLevels` |
| `CatalogueTrailer`, `RiggingKit` | Trailer module + rigging |
| `FactoryOption` + `FactoryOptionCategory` (compatibleBoatModelIds) | Optional features + `applicableVariantIds` |
| `DealerFitPart` + `DealerFitCategory` + `DealerFitKit` | Dealer-fit categories + options merging |
| `BMTQuote` (selected* ids + pricing breakdown) | `users/{uid}/quotes/{quoteId}` |

**Both teams built a Highfield Boat-Motor-Trailer configurator for the same client.** This is the crux — the CPQ core is duplicated, not complementary.

### Net-new in NSM-Hub (HelmLogic has nothing equivalent)

1. **Service work quoting** (`service-hub`, `Quote`, `Operation` = labor[desc/rate/hours] + `Part[]`). The blueprint's original core.
2. **Service bookings** (`bookings`, `BookingApplication` with non-guessable `accessKey` public links — customers self-submit booking requests via `booking-application/[accessKey]`).
3. **Yamaha diagnostics** (`yamaha-diagnostics`, `DiagnosticReport` — parses engine-data PDFs via `pdf-parse`, extracts hour-analysis/diagnosis/oil records, AI-generates report content). HL's Yamaha module is catalog-only.
4. **Insurance quoting** (`insurance-quotes`).
5. **Checklists** (`Checklist`, `ChecklistItem` tree, boat-management checklists).
6. **Kit approval workflow** (`Kit` with P&A + Service sign-off status machine — `Created by Sales → Awaiting checks → Approved by P&A → Approved by Service → ...`).
7. **External CRM sync** (`CrmCredentials` tenantId/clientId/clientSecret + `SyncAuditLog` — looks like MS Dynamics/Business Central integration).

### Overlap — both have (reconcile)

- Customers (`Customer`), Staff/Users, dealership/org management, catalogue management.

---

## Strategic fork — the decision to make together

The overlap means this isn't a clean "add NSM-Hub's features." There's a duplicate Highfield-CPQ core to reconcile AND net-new domains to absorb. Four directions:

### Option A — HelmLogic absorbs NSM-Hub (HL is base)
Port NSM-Hub's net-new domains into HL as new modules/route-groups; map NSM-Hub CPQ data into HL's `data-warehouse`; downgrade ported components to HL's stack.
- **Pro**: preserves HL's 9 shipped releases (lifecycle, PDF, SharePoint, planning system, pricing maturity).
- **Con**: porting effort (stack downgrade) + CPQ data migration.

### Option B — NSM-Hub becomes base
Port HL's mature quoting/lifecycle/pricing/PDF into NSM-Hub (newer stack).
- **Pro**: newer stack, broader domain coverage out of the box.
- **Con**: re-ports/throws away 9 releases of production HL; HL's quote lifecycle (Send/Lock/Audit/Scenarios/SharePoint) is far more mature; big regression risk; NSM-Hub auth/org model is thinner.

### Option C — Suite, not merge
Keep both apps; unify under one shell (shared auth, shared Firestore project, shared nav, cross-linking). HL owns CPQ/quoting; NSM-Hub owns service/bookings/diagnostics.
- **Pro**: lowest risk, fastest, no stack reconciliation.
- **Con**: two codebases + two stacks to maintain; duplicate CPQ persists.

### Option D — Selective absorption (pragmatic hybrid)
HL absorbs ONLY NSM-Hub's net-new domains (service-hub, bookings, diagnostics, insurance, checklists, kit-workflow, CRM sync). **Drop** NSM-Hub's duplicate CPQ (catalogue/BMTQuote/highfield-cpq) — HL's `data-warehouse` + quote flow is the surviving CPQ. One mature CPQ core, gain the unique domains.
- **Pro**: eliminates the duplication problem; takes what's genuinely new; one source of truth.
- **Con**: requires confirming HL's CPQ ≥ NSM-Hub's on every dimension before retiring NSM-Hub's; service/diagnostics still need stack-downgrade porting.

---

## Recommendation (for discussion, not decided)

**Option D (selective absorption)** looks strongest: HL is the more mature, production-shipped base, and keeping two Highfield CPQ cores is the worst outcome. Absorb the genuinely-new domains (service quoting, bookings + public links, Yamaha diagnostics, insurance, checklists, kit-approval, CRM sync) into HL as new epics/modules; retire NSM-Hub's CPQ in favour of HL's. This also slots cleanly into the v1.10+ dealer-ops priority the stakeholders just set — service/bookings/diagnostics ARE dealer-ops.

**Open questions before committing to a direction:**
1. How production/used is NSM-Hub today? Real NSM staff using it, or internal prototype? (Changes data-migration urgency.)
2. Is the duplicate CPQ in NSM-Hub actually used, or was HL always meant to be the CPQ? (If NSM-Hub's CPQ is live with real quotes, Option D needs a data-migration story.)
3. Does the CRM sync (`CrmCredentials`) point at a system HL also needs to integrate with?
4. Auth: consolidate onto HL's Firebase Auth + org/permissions model? (NSM-Hub looks thinner here.)

---

## Next steps (once direction is chosen)

- Deeper read of the net-new domain code (service-hub, bookings, yamaha-diagnostics page + component bodies) to size each absorption story.
- Per-domain absorption stories sized + slotted into the v1.10+ roadmap (likely new epics: "Service & Bookings", "Diagnostics", "Insurance").
- Data-migration plan if NSM-Hub's Firestore holds real records to preserve.
- Stack-port strategy (component-by-component downgrade vs. rewrite) for the absorbed domains.
