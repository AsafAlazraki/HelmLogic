# HelmLogic — Release Notes v1.0.0
> Release Date: 2026-03-31
> Branch: claude/app-overview-wKiZ1 → main
> 193 commits | 50+ new components | 8 new Firestore collections

---

## Stock Management System (Complete)

### Stock Boats Table
- Full spreadsheet-style table with 12 columns: Date into Stock/ETA, Days in Stock, Status, Location, Sold By, Stock Number, Label, Model, Colour, Serial Number, Material, Notes
- Sortable column headers (click to toggle asc/desc)
- Status badges (green = In Stock, blue = On Order)
- Material badges (red = PVC, grey = HYP)
- Client-side search across all text fields
- Filters: Status, Location, Material dropdowns
- Bulk select with checkboxes + bulk delete with confirmation
- Individual delete with confirmation dialog
- Row click opens detail panel (slide-out Sheet)

### Stock Item Detail Panel
- Photo gallery with upload, delete, and enlarge
- Catalog photo fallback when no custom photos (from matched model/variant)
- PDF attachments with upload and download
- All item fields displayed as label/value pairs

### Stock Item CRUD
- Create new stock items with all fields
- Edit existing items
- Auto-generated stock numbers
- Location dropdown from module settings
- Date picker for stock date/ETA

### On Order Tab
- Same table as Stock Boats, auto-filtered to "On Order" status
- Default location "China" for new on-order items
- Shared search and filters

### Delivered Deals
- Separate table with 25 columns for tracking sold/delivered boats
- Includes: motor, motor S/N, trailer, customer notes, P/O/deal number, delivery date, invoiced amount
- Boolean status columns: Invoiced, Deposit Paid, Paid in Full, Hull Only, Warranty Registered
- Detail panel on row click showing all deal information
- Bulk select and delete
- "Move to Delivered" action on stock items — transfers from inventory to delivered-deals

### CSV/Excel Import & Export
- Export to Excel (.xlsx) or CSV for both stock and delivered deals
- Headers always included even when empty (template export)
- Import with file drag-and-drop or browse
- Column auto-mapping (handles various header naming conventions)
- Smart model matching — fuzzy matches imported model names to catalog
- Duplicate detection using multi-field fingerprinting (stock number, serial number, model+colour+label)
- Auto-populates module stock locations from imported data
- Preview table showing first 5 rows before import

### Stock Location Map
- Interactive map using Leaflet + OpenStreetMap (no API key needed)
- Location pins with item counts
- Click marker for item list popup
- Location summary cards with status breakdown
- Pan-to-location on card click

### Stock Assignment View
- Two-column layout: parent org stock (left) + sub-dealer distribution (right)
- Assign dropdown on each stock item
- Recall button to bring stock back from sub-dealers
- Per-sub-dealer cards with live Firestore queries

---

## Sub-Dealer Experience

### Sub-Dealer Module View
- Same tab styling as parent org (Dashboard, Stock Management, Price List)
- Dashboard opens by default with:
  - Summary stats (Your Stock, On Order, Locations)
  - Parent org stock preview card ("Northside Marine Stock")
  - Own stock card (editable)
  - Price List access card
  - Info panel (supplier, module, access status)
  - On Order preview

### Stock Visibility Controls
- Parent org controls stock sharing via Settings toggle
- Column visibility settings — choose which columns sub-dealers see
- Sub-dealers see parent org name in workspace title
- Delivered Deals, Map View, and Assignments hidden for sub-dealers
- Sub-dealers can view parent org stock + their own assigned stock

### Hold Request System
- Sub-dealers can request stock boats be put on hold
- "Hold" button on each stock row (visible to sub-dealers)
- Must associate with a customer (search existing or create new)
- Creates hold request in Firestore with boat snapshot
- Notifies Brand Captain via notification system
- Parent org "Hold Requests" tab with accept/reject workflow
- Accept transfers stock to sub-dealer + notifies requester
- Reject with optional reason + notifies requester

---

## Module Settings

### Stock Location Manager
- Add/remove stock locations
- Sub-dealer stock sharing toggle (Private / Shared)
- Column visibility checkboxes (when sharing enabled)
- Sub-dealers shown as auto-populated locations with badge

### Module Role Assignment
- Assign Brand Captain (receives hold request notifications)
- Assign Module Manager (secondary role)
- Dropdown of org members

### Per-Module Dealer Fit Categories
- Add, remove, rename categories per module
- Inline rename with pencil icon
- Stored on module document

### Permissions
- New permission keys: Manage Stock, View Stock
- Stock Management tab gated by permissions
- Stock table read-only for users without Manage Stock
- Permissions table in org settings with checkboxes

---

## Dashboard Redesign

### Parent Org Dashboard
- Summary stats: In Stock, On Order, Locations, Proposals
- Quick-access cards: Stock Management, Catalog, Pricing
- Recent Proposals grid on the right
- Everything fits in one screen (no page scroll)

### Price List Viewer
- Collapsible range sections (click range header to expand/collapse)
- Shows model count + SKU count per range

---

## Agent Team Infrastructure

### Claude Code Agent Teams
- `.claude/agents/` definitions: Scrum Master, Developer (x3), Test Lead
- Worktree isolation strategy for parallel development
- Sprint tracking (tasks/sprint.md) and release notes (tasks/release-notes.md)
- Agent team visualization page at /admin/agent-team (admin-only)

---

## Technical

### New Firestore Collections
- `inventory/{itemId}` — Stock items
- `delivered-deals/{dealId}` — Delivered/sold boats
- `holdRequests/{requestId}` — Hold request workflow
- `customers/{customerId}` — Customer records
- `agent-team/{agentId}` — Agent status (admin dashboard)

### New Dependencies
- `leaflet` + `react-leaflet` — Map rendering (replaces Google Maps)
- `@types/leaflet` — TypeScript types

### Security Rules Updates
- `modules` — write access for all signed-in users
- `delivered-deals`, `holdRequests`, `customers` — read/write for signed-in users
- All existing rules preserved

---

## Files Changed (Key New Components)
- `src/components/stock-list.tsx` — Complete rewrite as spreadsheet table
- `src/components/stock-management-workspace.tsx` — Full workspace with tabs
- `src/components/stock-item-detail.tsx` — Detail panel with photos/PDFs
- `src/components/stock-item-form.tsx` — Create/edit dialog
- `src/components/stock-location-manager.tsx` — Location + visibility settings
- `src/components/stock-location-map.tsx` — Leaflet map
- `src/components/stock-location-map-leaflet.tsx` — Leaflet inner component
- `src/components/stock-assignment-view.tsx` — Sub-dealer assignment UI
- `src/components/stock-export.tsx` — Excel/CSV export
- `src/components/stock-import.tsx` — Import with smart matching
- `src/components/delivered-deals.tsx` — Delivered deals table
- `src/components/delivered-deal-detail.tsx` — Deal detail panel
- `src/components/delivered-deals-export.tsx` — Deals export
- `src/components/delivered-deals-import.tsx` — Deals import
- `src/components/move-to-delivered.tsx` — Transfer dialog
- `src/components/hold-request-dialog.tsx` — Hold request flow
- `src/components/hold-requests-dashboard.tsx` — Accept/reject dashboard
- `src/components/customer-picker.tsx` — Customer search/create
- `src/components/customer-list.tsx` — Customer management
- `src/components/module-role-assignment.tsx` — Brand Captain/Manager
- `src/components/module-dealer-fit-manager.tsx` — Per-module categories
- `src/components/agent-team-dashboard.tsx` — Agent visualization
- `src/lib/hold-request-types.ts` — TypeScript interfaces
- `src/lib/notifications.ts` — Notification utility
