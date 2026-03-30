# HelmLogic — Session Handover Document
> Give this file to a new Claude session along with the CLAUDE.md file.
> Updated: 2026-03-30

---

## What Is HelmLogic?

HelmLogic is a marine dealer management SaaS platform. It lets boat brands (vendors) distribute boat data to dealerships (organisations), who can then build quotes, manage inventory, run pricing, and distribute sub-dealer price lists. Think of it like a CRM + quoting + pricing tool for the marine industry.

**Primary client in app**: Northside Marine (orgId: `AcFZVEFA5UDJG2hyetWT`) — a Highfield Boats dealer.

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Firebase — Firestore (DB), Auth, Storage
- **Deployment**: Firebase App Hosting (`studio--studio-2290360004-3b963.us-central1.hosted.app`)
- **Firebase Project**: `studio-2290360004-3b963`
- **Dev Branch**: `claude/app-overview-wKiZ1` — **always push here**

---

## Firestore Data Hierarchy

```
data-warehouse/{vendorId}/
  ranges/{rangeId}/
    models/{modelId}/
      variants/{variantId}      ← SKU: material + color + sellPriceExclGst

modules/{moduleId}              ← Org's access point to a vendor

organisations/{orgId}/
  modelOverrides/{modelId}      ← Org-specific pricing overrides
  dealerFitSelections/          ← Dealer-fit option selections
  exchangeRates/{currencyCode}  ← e.g. USD exchange rate for AUD conversion
  priceLists/{priceListId}      ← Sub-dealer price lists
  priceLevelDefinitions/        ← Price level config (price book)
  productPrices/                ← Product cost/margin data

users/{userId}/
  quotes/{quoteId}/
    service_items/{itemId}
  notifications/{notifId}
  routes/{routeId}
```

---

## Key IDs (Hard-Coded References)

| Thing | ID |
|---|---|
| Highfield vendor | `LafOLpLb6QIFE856TiD4` |
| Highfield module | `M1Yf3R9igpJDxJnOVr6f` |
| Northside Marine org | `AcFZVEFA5UDJG2hyetWT` |
| Range — Classic | `qo7IePnRzJxjrYyLWhTn` |
| Range — Roll-Up | `EqcKQ51svI1I2Q5poFdl` |
| Range — Ultra-Light | `QsGZuVwutEr5yyMkp97j` |
| Range — Sport | `nQ2LE50z9Tbf2uss0Ote` |
| Range — Adventure | `sEzdrM2fZsrOKA3ACrJp` |
| Range — Patrol | `vfXxDuMpChteKncb7LnG` |
| Range — Coaster | `coaster` |

---

## Data Model Notes

- **Vendor** has `slug`, `vendorType`, `currency` (Highfield = `USD`)
- **Range** = model series (CL = Classic, SP = Sport, RU = Roll-Up, AL = Adventure, PA = Patrol)
- **Model** = specific boat (e.g. `CL260`) — holds specs, optional features, trailer config, registration costs
- **Variant** = SKU (e.g. `CL260-GREY-HYP`) — one per material × color combo, each has `sellPriceExclGst`
- **Optional features**: have `applicableVariantIds` array to restrict which SKUs can use a feature
- **Motor compatibility**: driven by `specifications.motorConfigurations[0].engines[0].minHp/maxHp` + `steeringType`
- Model documents do **NOT** have an `order` field — never use `orderBy('order')` on models or variants; use unordered `collection()` queries

---

## Pricing Rules

- All prices stored as `sellPriceExclGst` (exclusive of GST)
- Highfield factory prices are in **USD** — use org exchange rate at `/organisations/{orgId}/exchangeRates/USD` to convert to AUD sell price
- GST (10%) applied at finalization only
- `cost` field stores buy price for margin tracking

---

## Firestore Security Rules — CRITICAL

**The `firestore.rules` file must be manually deployed** — it does NOT auto-deploy with Firebase App Hosting.

To deploy: `firebase deploy --only firestore:rules`

**When rules change, always paste the full ruleset here for the user to copy into the Firebase Console (Firestore → Rules tab) as the CLI credentials may be expired.**

### Current Deployed Rule Highlights

- Global: HL Admins (`appRole == 'HelmLogic Admin'` or in `roles_admin` collection) have full read/write
- `users/{userId}`: owner OR HL Admin OR **same-org member** can read + update (this was a recent fix — `allow update` was previously owner/admin only, blocking Managing Directors from editing team members)
- `organisations/{orgId}`: any signed-in user can read; HL Admin or org member can write
- `data-warehouse/**`: any signed-in user can read/write
- Everything else: generally signed-in users can read; writes restricted

---

## App Architecture

### Route Structure

```
/manage                         → Org settings, users, roles, branding
/modules/[id]                   → Module workspace (catalog, pricing, quotes)
/[orgSlug]/modules/[id]         → Same, with org-slug prefix
/proposals                      → Quote/proposal list
/price-book                     → Master pricing (cost + margin management)
/sub-dealers/[id]               → Sub-dealer management
/organisations/[id]             → HL Admin org editor
/admin                          → HL Admin area
```

### Key Components

| Component | Purpose |
|---|---|
| `price-list-manager.tsx` | Distributor tool to create/edit price lists and assign to sub-dealers |
| `price-list-viewer.tsx` | Sub-dealer read-only view of assigned price lists |
| `manage-organisation-page.tsx` | Org settings: company details, roles/permissions, team directory, T&C |
| `highfield-quote-flow.tsx` | Quote builder for Highfield boats |
| `proposal-view.tsx` / `proposal-pdf.tsx` | Proposal rendering and PDF export |
| `price-book-table.tsx` | Master price book with cost/margin/price-level management |
| `module-pricing-dashboard.tsx` | Pricing tab inside module workspace |
| `exchange-rate-manager.tsx` | Manage USD→AUD exchange rates |

### Custom Firebase Hooks

- `useCollection(memoizedQuery)` — real-time collection listener; returns `{ data, loading, error }`; data items have `id` field injected
- `useDoc(memoizedRef)` — real-time doc listener; returns `{ data, loading, error }`; data has `id` field injected
- `useMemoFirebase(fn, deps)` — memoizes Firestore refs/queries to prevent infinite re-render loops (**always use this instead of useMemo for Firestore refs**)
- `useUser()` — returns `{ user, loading }` from Firebase Auth

---

## Sub-Dealer Feature

Organisations can have `subDealersEnabled: true` and child orgs with `parentOrganisationId`.

**Sub-dealer price lists** (`organisations/{parentOrgId}/priceLists/{id}`):
```typescript
{
  name: string,
  isSubDealerPriceList: boolean,  // NEW — triggers SD-specific columns
  subDealerIds: string[],         // which sub-dealer orgs can see this
  columns: Column[],              // custom price columns
  rows: Row[],                    // boats in the list
}

Row {
  variantId, modelId, modelName,
  rangeId, rangeName,
  material, colorName, imageUrl,
  cells: Record<colId, string>    // price values per column
}
```

**SD fixed columns** (when `isSubDealerPriceList = true`): IDs are `sd_price_incl_gst`, `sd_gp`, `sd_sell_incl_gst`. These are rendered before custom columns and cannot be deleted.

---

## PENDING WORK (Timed Out — Implement Next)

The previous session planned and began implementing but timed out before writing any code. **All of the following is unimplemented** and needs to be built:

### 1. `price-list-manager.tsx` — Select All in Boat Picker

In `BoatPickerDialog`:
- **Per-model select all**: Add a "Select All" button in the variants panel header (selects all non-added SKUs for the currently selected model)
- **Per-range select all**: Add a small "All" button that appears on hover next to each range in the left range panel. Uses `getDocs` to fetch all models + variants for that range, then adds them all to `pendingRows`. Track loading state with `loadingRangeId` state.

```typescript
// Range-level select all — uses getDocs (one-time fetch, not reactive)
const selectAllInRange = async (rangeId: string, rangeName: string) => {
    setLoadingRangeId(rangeId);
    const modelsSnap = await getDocs(collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models`));
    for (const modelDoc of modelsSnap.docs) {
        const variantsSnap = await getDocs(collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${modelDoc.id}/variants`));
        // add each non-existing, non-pending variant to pendingRows
    }
    setLoadingRangeId(null);
};
```

### 2. `price-list-manager.tsx` — Range Grouping in Editor Table

In `PriceListEditor`, group table rows visually by range. Build a `renderList` from the flat `rows` array that inserts range header items whenever the range changes:

```typescript
const renderList = useMemo(() => {
    const items = [];
    let lastRangeId = '';
    rows.forEach((row, rowIdx) => {
        if (row.rangeId !== lastRangeId) {
            items.push({ type: 'header', rangeName: row.rangeName, rangeId: row.rangeId });
            lastRangeId = row.rangeId;
        }
        items.push({ type: 'row', row, rowIdx });
    });
    return items;
}, [rows]);
// Render: range header rows get a styled <tr> with gradient bg + range name; use colSpan for full width
```

### 3. `price-list-manager.tsx` — "Is Sub Dealer Price List" Toggle on Creation

Replace the simple name-only creation dialog with a two-step or enriched dialog:
- Name input (as before)
- **Visual card toggle**: two clickable cards — "Standard" (TableIcon) vs "Sub Dealer" (Users icon) — highlight selected with `border-primary bg-primary/5` + checkmark badge
- When Sub Dealer is selected, show a note: "Includes sub dealer price, GP + sell columns"
- Store `isSubDealerPriceList: true/false` in the Firestore doc on creation
- When `isSubDealerPriceList = true`, show the 3 fixed SD columns (`sd_price_incl_gst`, `sd_gp`, `sd_sell_incl_gst`) BEFORE any custom columns in the table; these columns have no delete button
- Show a "Sub Dealer" badge on price list cards in the list view

```typescript
const SD_COLUMNS: Column[] = [
    { id: 'sd_price_incl_gst', header: 'Sub Dealer Price (incl. GST)' },
    { id: 'sd_gp', header: 'GP' },
    { id: 'sd_sell_incl_gst', header: 'Sell (incl. GST)' },
];
// In editor: const allColumns = priceList.isSubDealerPriceList ? [...SD_COLUMNS, ...columns] : columns;
// SD columns: no X/delete button; custom columns keep delete button
// In addRows: init cells for allColumns, not just columns
```

### 4. `price-list-viewer.tsx` — Parent Org + Sub Dealer Branding Header

Fetch both org docs at the top of the viewer:
```typescript
const parentOrgRef = useMemoFirebase(() => doc(firestore, 'organisations', parentOrganisationId), [...]);
const { data: parentOrg } = useDoc(parentOrgRef);
const subDealerRef = useMemoFirebase(() => doc(firestore, 'organisations', subDealerOrgId), [...]);
const { data: subDealerOrg } = useDoc(subDealerRef);
```

Show a branding header bar at the top of the viewer:
- Left: parent org logo (`primaryLogoUrl`) + org name
- Right: sub dealer name
- Styled with `border-b`, subtle background, clean typography

### 5. `price-list-viewer.tsx` — Clickable Rows + Right-Side Detail Panel

Add `selectedRow: Row | null` state. Make each table row clickable (`cursor-pointer`, `onClick={() => setSelectedRow(row)}`).

Use a **split-pane layout** (no overlay/modal — inline side panel):
```tsx
<div className="flex flex-1 min-h-0 overflow-hidden">
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* price list tables */}
    </div>
    {selectedRow && (
        <div className="w-96 shrink-0 border-l bg-white overflow-y-auto p-6">
            {/* Detail panel: large image, model name, range, material, colour, SKU, all price columns */}
        </div>
    )}
</div>
```

Detail panel should show:
- Large boat image (if available, else placeholder)
- Model name (large bold)
- Range badge
- Material + Colour
- SKU/Variant ID (monospace)
- Divider
- All price columns as labelled rows (label: value pairs)
- Close button (X) at top-right

---

## Common Gotchas & Lessons

| Situation | Rule |
|---|---|
| Firestore query with `orderBy('field')` | Silently excludes docs that don't have that field. Use unordered `collection()` instead for model/variant queries. |
| Firestore security rules not working | Rules file must be **manually deployed** (`firebase deploy --only firestore:rules`). App Hosting only deploys Next.js code. |
| `useMemo` for Firestore refs | Must use `useMemoFirebase` not `useMemo` — the custom hook marks refs as memoized; using plain `useMemo` throws a runtime error. |
| Vendor ID in data-warehouse | Always use `LafOLpLb6QIFE856TiD4`, never `highfield` (slug). The app reads by vendor doc ID. |
| `updateDoc` with `undefined` | Firestore JS SDK throws if any value is `undefined`. Always use `|| null` or `|| ''` fallbacks. |
| Nested Radix Tabs | Can cause context conflicts. If a tab's content is blank, replace nested `<Tabs>` with plain button-switcher + conditional divs. |
| Firestore rules update | When changing `firestore.rules`, always paste the full ruleset in your response so the user can copy-paste into Firebase Console. Do not assume CLI deployment will work (credentials often expired). |
| Verifying data in Firestore | Don't tell the user data "is there" without querying to confirm. The seeding scripts and vendor paths have caused confusion before. |
| `organisation.id` from `useDoc` | The `useDoc` hook injects `id: snapshot.id` — it's the Firestore document ID, not a field in the document data (though enrolled user docs also store `id` as a data field for legacy reasons). |
| Firestore `allow update` scope | The rule was previously `isOwner || isAdmin` only for `users/{userId}`. It now includes same-org members. If editing a team member fails, check that the rules are deployed. |

---

## Deployment Notes

- **App code** deploys automatically via Firebase App Hosting when pushed to `claude/app-overview-wKiZ1`
- **Firestore rules** (`firestore.rules`) must be deployed manually: `firebase deploy --only firestore:rules`
- **CLI credentials** in this environment are often expired — generate new token with `firebase login:ci` or paste rules into Firebase Console manually
- **firebase.json** is configured for project `studio-2290360004-3b963`

---

## Style Guide (UI Conventions)

- Font sizes: `text-[9px]` for labels, `text-[10px]` for small uppercase, `text-xs` for body
- Labels: always `uppercase tracking-widest font-black text-slate-400/500`
- Buttons: `rounded-xl` for small, `rounded-2xl` for medium, `rounded-3xl` for dialogs
- Borders: `border-2` almost everywhere (not `border`)
- Primary color: org's `primaryColor` field, defaulting to app primary (blue)
- Dialogs: shadcn `Dialog` with `rounded-3xl border-4 shadow-2xl`
- Tables: `rounded-2xl border-2 border-slate-100` container, `text-[9px] font-black uppercase tracking-widest` headers
- Toasts: `useToast()` hook — `toast({ title })` for success, `toast({ variant: 'destructive', title })` for errors
- Always `console.error(error)` in catch blocks before showing toast (so real errors aren't silently swallowed)

---

## Git Workflow

- Branch: `claude/app-overview-wKiZ1`
- Push: `git push -u origin claude/app-overview-wKiZ1`
- On 403: retry up to 4× with exponential backoff (2s, 4s, 8s, 16s)
- Commit messages: conventional commits (`feat:`, `fix:`, `refactor:`)
- Always create new commits, never amend published commits

---

## How to Resume the Pending Price List Work

1. Read `src/components/price-list-manager.tsx` (738 lines) — understand the existing `BoatPickerDialog`, `PriceListEditor`, and `PriceListManager` components
2. Read `src/components/price-list-viewer.tsx` (127 lines) — understand the viewer structure
3. Implement the 5 pending items described in the PENDING WORK section above (all unimplemented)
4. The files are ready to be rewritten — no partial changes exist yet
5. Commit and push to `claude/app-overview-wKiZ1`
