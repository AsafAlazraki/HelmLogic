# HelmLogic — Release Notes v1.7.0

> Release Date: 2026-05-06
> Branch: `claude/app-overview-wKiZ1` → main
> First minor release on top of v1.6.2 (planning-system release)

### Release Stats
- **33 commits** since v1.6.2 (29 feat + 3 fix + 1 chore — including 4 one-shot planning seeds created and removed in the same dev cycle)
- **23 files changed** across the customer-PDF authoring stack, the live preview pane, real-data fetchers, content-block schema + brand override resolver, and a TipTap editor extension
- TypeScript: zero new errors from v1.7 work
- `npm run build`: clean

### Source of Requirements
v1.6.2 shipped the planning-system rebalance — v1.7's 6-story 20-pt composition was set as: 1.8.1 (Content Block Manager, 5 pts), 1.8.5/1.8.6/1.8.9 (Document Templates surface, 8 pts), 1.8.7 (Live PDF preview, 5 pts), and 1.2.1/1.2.2 (PDF + brand-aware injection, 11 pts pulled forward).

The build cycle that followed delivered all of those plus a stack of polish from feedback rounds — image authoring with Word-style text wrap, real Firestore-driven previews, drag-drop section reorder, per-salesperson messages, customisable sub-headers, per-content-block PDF pages, cover redesign with overlap fix and brand cascade revert, motor + trailer expanded detail. The 6.4.x process-discipline stories (dependsOn schema + pre-merge regex + DEPENDS ON convention) remain on v1.8.

---

## Quote Content Block Manager (1.8.1) — the cornerstone

A new authoring surface under `/manage` → Document Templates lets org admins author the rich-text content that appears on every customer-facing PDF. Replaces the legacy single-textarea `organisation.termsAndConditions`.

### Schema
```
organisations/{orgId}/contentBlocks/{blockId}
  blockType: 'salesperson-message' | 'why-us' | 'brand-story'
           | 'after-sales' | 'finance-info' | 'value-summary'
           | 'terms-and-conditions'
  html: string           ← TipTap-serialised
  subHeader?: string     ← author-customisable PDF sub-header (round-5)
  documentTypes: ['quote' | 'contract'][]
  startsOnNewPage: boolean
  createdAt, updatedAt, updatedByUid, updatedByName

organisations/{orgId}/contentBlocks/{blockId}/brandOverrides/{vendorId}
  html: string           ← brand-specific override (1.2.2)

organisations/{orgId}/contentBlocks/{blockId}/versions/{versionId}
  html, level, savedAt, savedByUid, savedByName
```

### Resolver
`resolveContentBlocksForQuote(firestore, orgId, vendorId, documentType)` returns a `Partial<Record<BlockType, string>>` map at PDF render time. For each block: brand override (if set for the quote's vendorId) takes precedence over the org default; missing / empty blocks are absent from the map. Parallel `resolveContentBlockSubHeadersForQuote()` returns the sub-header overrides.

### Auto-migration
On first save into the manager, the legacy `organisation.termsAndConditions` textarea is migrated into a `terms-and-conditions` content block. Idempotent — safe across re-runs.

---

## Branded PDF Quote Generation (1.2.1) + Brand-Aware Content Injection (1.2.2)

The customer-facing PDF (`src/components/proposal-pdf.tsx`) is rebuilt around the content-block resolver.

### Cover page (round-3 redesign)
- Full-bleed background image with deep-navy fallback
- Soft top-down white gradient over the logo bar (replaces hard 80-px white band)
- Bottom-up navy gradient for customer-info legibility
- Org logo on the left, single right-side vendor logo (boat brand)
- Bottom hero block: official-proposal badge → range → model name (fontSize 56 italic, lineHeight 1.05) → model code → accent rule → customer details + total investment

### Per-block pages (round-5)
Each content block renders as its OWN `<Page>` with its OWN `InnerHeader` matching the block type. Document order:
```
Cover (anchored)
zoneA blocks (one page each, own header)
Vessel Configuration (anchored — specs + factory options + motor + trailer + dealer fit)
zoneB blocks
Investment Summary (anchored — pricing breakdown only)
zoneC blocks (incl. Terms & Conditions with fallback chain)
Acceptance (anchored — signatures + footer)
```
Page numbers are dynamic via `@react-pdf` render prop. Section headers across all content blocks use the InnerHeader page-level style (bold italic uppercase title + uppercase letter-spaced sub + 2-px navy bottom border). Customisable sub-headers per block (round-5) thread through preview + download + finalize.

### Motor + trailer detail (round-3)
Page 2 motor + trailer sections render as full blocks:
- Motor: brand logo + name + price + 4-up specifications grid (HP / shaft / control / starting / tilt-trim / fuel / prop / warranty) + categorised accessories list (real categories: Propeller / Rigging / Other) + motor subtotal
- Trailer: brand logo + name + price + 12-field specifications grid + categorised options list + trailer subtotal
- Both have hero-banner photos above the spec grid (fixed: was a tiny inline thumbnail next to the price)

### Brand-aware overrides (1.2.2)
`brand-override-picker.tsx` lets org admins author per-vendor variants of any content block. The resolver's brand-override fallback in `resolveContentBlocksForQuote()` automatically picks the right copy at PDF render time based on `quote.vendorId`.

---

## Live PDF Preview Pane (1.8.7)

`src/components/content-blocks-pdf-preview.tsx` — full customer-facing `ProposalPDFDocument` rendered inside an in-browser `PDFViewer`, alongside the editor.

### Performance
- **Debounce + memo** (round-2): 1500ms debounce on content blocks / sections / salesperson profile + `useMemo` on the document tree → PDFViewer iframe regenerates once when edits settle, not per keystroke. "Updating…" indicator with Loader2 spinner.
- **Cover-as-data-URL** (round-4): cover image pre-fetched as a base64 `data:` URL via FileReader so `@react-pdf` doesn't re-fetch + decode on every regeneration → first-page lag eliminated. CORS / network failure falls through to URL form.

### Focus mode
`Maximize2` button in the header strip opens a full-viewport overlay with PDFViewer + toolbar; ESC closes. Only one PDFViewer instance renders at a time (the inline preview is replaced with a placeholder while focus mode is active) — no double-render lag.

### Real Firestore overlays (1.8.10, round-4)
Preview fetches REAL data instead of using fake fixture content:
- **Motor** — finds the org's vendor with `vendorType === 'Motor Brand'`, walks its dataSets, picks the first row in the 75–100 HP envelope (Sport 560 territory) with a `SummaryImage`. Real `Model Name` / `HP Rating` / `Shaft Length` / etc., real `masterAccessories` (filtered to non-standard, capped at 8).
- **Trailer** — walks the 7 real trailer-brand vendor IDs from `scripts/seed-trailers.ts` (`mackay-trailers`, `redco-tinka-trailers`, `gfab-trailers`, `stacer-trailers`, `dunbier-haines-bmt`, `dunbier-trailers`, `nsm-custom-trailers`), picks the first trailer rated 5–6.5 m hull with an `imageUrl`. Real `specifications.{boatSizeMtr,lengthMtr,atmKg,tareKg,wheelSize,winch,betweenGuardsMm,plug}`.
- **Highfield vendor logo** — pulled from `data-warehouse/{vendorId}.logoUrl`.
- Sections fall back silently to placeholders only when Firestore data isn't seeded. No Unsplash. No invented brands.

---

## Image Authoring (1.8.2 — retargeted from v1.8)

TipTap rich-text editor in content blocks now supports inline images with full layout control.

### Custom `ResizableImage` extension
Extends `@tiptap/extension-image` with `width` (CSS string like `"50%"`) and `align` (`left | center | right`) attributes, serialised both as `data-*` attrs (consumed by the PDF parser) and inline `style` (so the editor itself shows the correct visual size + alignment).

### Contextual second-row toolbar (round-7)
Standard text controls (H2/H3/Bold/Italic/lists/link/insert-image/undo/redo) always visible. When an image is selected a SECOND row appears below it:
- **Size** pills: 25% / 50% / 75% / 100%
- **Align** buttons: left / center / right (with tooltips: *"Align left — text wraps to the right"*)
- **Replace**: opens picker, preserves current size + align
- **Remove**: deletes the image

### Word-style text wrap (round-7)
Left/right alignment with width < 100% floats the image:
- **Editor**: CSS `float: left|right` with proportional margin so the next paragraph(s) flow around it. `display: flow-root` on the editor's prose container contains floats.
- **PDF**: `@react-pdf` has no native float, so the parser groups a floated image with the immediately-following text segment into a `flexDirection: row` View — image on one side, text-block on the other (`flex: 1`). For align right the row is reversed.
- Center / 100% width images stay block-level.

### Format restriction (round-6)
Upload picker accepts JPG/PNG only — `@react-pdf <Image>` doesn't support SVG / WebP / GIF. Existing unsupported images render an amber-bordered placeholder block in the customer PDF: *"Image cannot render on PDF — replace with a JPG / PNG"* — instead of disappearing silently.

---

## Per-Salesperson Messages + Photos (1.8.12)

### Schema
```
organisations/{orgId}/salesTeam/{userId}
  displayName, role, messageHtml, photoUrl, signOff
  updatedAt, updatedByUid
```

### Authoring
`salesperson-message-editor.tsx` lists every member of the org. Each has their own TipTap message + circular photo (`PhotoUploader`) + role + sign-off. Defaults to the current user.

### PDF rendering
Salesperson-message section reads from the resolved `salesTeam` doc using `quote.createdByUid`. Falls back to omitting the section when no profile exists. Section uses a polished page-level header with circular photo + name + role line.

---

## Drag-Drop PDF Section Reorder (1.8.11)

`src/lib/pdf-structure.ts` + `src/components/pdf-section-list.tsx` — author-driven ordering of content blocks within the customer PDF.

### Schema
```
organisations/{orgId}/pdfStructure/{documentType}
  sections: [{ id, key, order }]
```
Anchored sections (cover-page, vessel-config, pricing-section, signatures) are locked in position; content blocks freely reorder via `@dnd-kit`. `partitionContentBlocks()` returns `zoneA` / `zoneB` / `zoneC` based on which anchored section the block sits between.

### UX
Sortable list of all 11 PDF sections. Anchored rows show `Lock` icon; content rows have `GripVertical` drag handles. Reorders persist to Firestore.

---

## Document Templates Surface (1.8.5 + 1.8.6 + 1.8.9)

### Unified surface (1.8.5)
The standalone "Quote Content" tab is gone. `/manage` now has a single **Document Templates** tab housing both Quote and Contract authoring with sub-tabs.

### Multi-doc field (1.8.6)
`documentTypes: DocumentType[]` on each content block — a single block can be tagged for `quote`, `contract`, or both. Content rendered into the right PDF based on the document type filter.

### Aesthetic (1.8.9)
Dark NAVY band headers on every authoring card. History panel for version timeline. Brand override picker as a dedicated sub-component.

---

## Files Changed (highlights)

| File | What changed |
|---|---|
| `src/components/proposal-pdf.tsx` | Cover redesign + per-block pages + motor/trailer expanded detail + customisable sub-headers + dynamic page numbers |
| `src/components/content-blocks-pdf-preview.tsx` | Live preview pane + debounce/memo + focus mode + cover-as-data-URL pre-fetch + real motor/trailer/vendor fetcher |
| `src/components/content-block-detail.tsx` | Block edit dialog with subHeader input + brand override picker integration + version history |
| `src/components/content-block-manager.tsx` | Master-detail authoring surface + drag-drop section list |
| `src/components/feature-rich-text-editor.tsx` | `ResizableImage` extension + 2-row toolbar + JPG/PNG restriction + replace/remove |
| `src/components/pdf-section-list.tsx` | DnD-kit sortable PDF section list |
| `src/components/salesperson-message-editor.tsx` | Per-user message + photo editor |
| `src/components/photo-uploader.tsx` | Single-image uploader (vs multi-image FeatureImageUploader) |
| `src/lib/content-blocks.ts` | Schema + resolver + sub-header resolver |
| `src/lib/tiptap-pdf.tsx` | TipTap HTML → @react-pdf renderer + image width/align/wrap support + unsupported-format placeholder |
| `src/lib/pdf-structure.ts` | Section-ordering schema + partition helpers |
| `src/lib/sales-team.ts` | salesTeam schema + resolver |
| `src/lib/sample-quote-fixture.ts` | Fixture with override hooks (real-data splice) |
| `src/lib/v17-polish-review-seed.ts` | One-shot polish-review seed (idempotent — appends ✓ ship lines across rounds 2–7) |
| `src/components/proposal-view.tsx` | Threads contentBlocks + contentBlockSubHeaders into the customer PDF download |
| `src/components/finalize-quote-dialog.tsx` | Same threading at finalize-snapshot time |
| `firestore.rules` | New paths: `contentBlocks`, `pdfStructure`, `salesTeam` (each `allow read, write: if isSignedIn()`) |
