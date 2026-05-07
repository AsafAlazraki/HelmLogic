# HelmLogic v1.7 — User Guide

> Audience: org admins + salespeople using the new customer-PDF authoring features.
> Companion to: `tasks/RELEASE_NOTES_v1.7.0.md` (engineering changelog).

This guide walks through every customer-PDF authoring capability v1.7 added. If you're reading the in-app **Feature Tracking → Release Notes** tab, those notes are the engineering summary; this is the practical "how do I use it" version.

---

## At-a-glance map

| What you want to do | Where to do it | Section |
|---|---|---|
| Author the rich-text content that appears on every customer PDF | `/manage` → **Document Templates** | [Content Blocks](#1-content-blocks-the-cornerstone) |
| Write a different version for a specific boat brand | Block edit → "Editing for {brand}" picker | [Brand overrides](#2-brand-overrides) |
| Add an image inline with the text | Block edit → toolbar → Insert Image | [Inline images](#3-inline-images-resize--align--text-wrap) |
| Re-order which sections appear and where | `/manage` → Document Templates → drag the section list | [Section order](#4-drag-drop-section-order) |
| Set a different sub-header under a section title | Block edit → "PDF sub-header" input | [Custom sub-headers](#5-custom-pdf-sub-headers) |
| Personalise the welcome message per salesperson | `/manage` → Document Templates → Salesperson Message → "Edit team" | [Per-salesperson messages](#6-per-salesperson-messages--photos) |
| Preview how the actual customer PDF will look | Right side of every block edit screen | [Live preview](#7-live-pdf-preview) |
| Tag a block as "Quote only" / "Contract only" / both | Block edit → "Appears on" pills | [Quote vs Contract](#8-quote-vs-contract-targeting) |

---

## 1. Content Blocks — the cornerstone

A **Content Block** is one section of rich text that appears on the customer PDF. v1.7 ships with seven block types, each mapping to a well-known position on the document:

| Block | Default position on PDF | What goes here |
|---|---|---|
| **Salesperson Message** | Top of the document | A personal note from the assigned salesperson |
| **Why Choose Us** | After the salesperson's message | Your dealership's positioning ("Why Northside Marine") |
| **Brand & Model Story** | Before the vessel configuration | What makes this boat / model special |
| **After-Sales Confidence** | Mid-document | Warranty, service network, ownership support |
| **Finance & Insurance (Info)** | Before the pricing table | Finance + insurance info (informational only — no live pricing) |
| **Value Summary** | After the pricing table | Why this package, why now |
| **Terms & Conditions** | Last narrative page | Boilerplate T&Cs — auto-migrated from the legacy textarea on first save |

### To author a block

1. Go to `/manage` → **Document Templates**.
2. Pick the **Quote** or **Contract** sub-tab.
3. Click a block in the left rail.
4. Click **Edit**.
5. Write the body in the rich-text editor (supports headings, bold, italic, bullet/numbered lists, links, images).
6. Click **Save**.

Each save records a **version** in the History panel — you can restore any previous version from there.

### Empty blocks

A block defined but with no content authored will simply be omitted from the customer PDF (no empty section). The exception is **Terms & Conditions**, which falls back to your legacy `organisation.termsAndConditions` text and then to a default 4-line set if nothing's authored.

---

## 2. Brand overrides

If your dealership sells multiple boat brands and you want different copy per brand (e.g. a different "Brand & Model Story" for Highfield vs. Yamaha vs. Stessl), use brand overrides.

1. Open any content block in `/manage` → Document Templates.
2. The "Editing for" dropdown defaults to **Org default**.
3. Switch it to a brand (vendor) you've configured.
4. Write the brand-specific version. **Save** persists this as a brand override under that block.
5. The customer PDF picks the brand override automatically based on the quote's vendorId.

The org-default version is the fallback when no brand override exists for the quote's brand.

---

## 3. Inline images — resize / align / text wrap

The rich-text editor in every content block supports inline images with full layout control.

### Insert an image

1. In edit mode, click the **Insert Image** button (image-plus icon) in the toolbar.
2. Pick a file. **Only JPG and PNG are accepted** — `@react-pdf` (the customer-PDF engine) doesn't render SVG / WebP / GIF, so they're rejected at upload.
3. The image appears at your cursor at 100% width.

### Resize / align / replace / remove

Click on any inserted image. A second toolbar row appears below the standard one with image-specific controls:

- **Size**: 25% / 50% / 75% / 100% pills (% of the column width)
- **Align**: left / center / right
- **Replace**: opens the file picker, preserves current size + align
- **Remove**: deletes the image

### Word-style text wrap

When you set an image to **Align Left** or **Align Right** AND its width is **less than 100%**, the next paragraph's text **wraps around it** — Word-style. Both in the editor view AND on the customer PDF.

- **Centered** images (or any image at 100% width) stay block-level — text comes after the image, full width.
- **100%-width** images can't have text wrap (no room for the wrap column).

### Why an image you uploaded doesn't appear on the PDF

If the image shows in the editor but is missing from the PDF preview / customer PDF:

- Open the block (read-only view) → click **Show raw HTML** → look at the **Detected Images** panel. It tells you per-URL whether the image is JPG/PNG (should render) or unsupported (won't render).
- If the URL is a Firebase Storage URL but the **Images N/M** pill in the preview shows a red ❌, click it → see the per-URL preload status. Common causes:
  - **CORS-BLOCKED** — image origin doesn't return CORS headers. The v1.7 server-side image proxy handles Firebase Storage + Yamaha CDN automatically.
  - **SharePoint /sites/ path** — needs SharePoint auth to fetch. Re-host the image on Firebase Storage.
  - **403 / 404 from upstream** — broken URL or expired token.

---

## 4. Drag-drop section order

Your customer PDF's section order is configurable. The four anchored sections — **Cover Page**, **Vessel Configuration**, **Pricing & Investment**, **Signatures** — are locked in position, but the seven content blocks can sit in any order between them.

1. `/manage` → Document Templates.
2. Left rail: each section has a drag handle (the six-dot grip icon) when it's a content block. Anchored sections show a **lock** icon.
3. Drag a content block to reorder. Persists immediately.

The PDF preview and the actual customer PDF respect your order.

---

## 5. Custom PDF sub-headers

Each section on the customer PDF has a **title** + a smaller **sub-header**. Defaults:

| Section | Default sub-header |
|---|---|
| Salesperson Message | "Personal Welcome" |
| Why Choose Us | "Our Promise To You" |
| Brand & Model Story | "Why This Boat" |
| After-Sales Confidence | "Ownership Support" |
| Finance & Insurance | "Payment & Coverage Options" |
| Value Summary | "Investment Summary" |
| Terms & Conditions | "Standard Proposal Terms" |

To override the sub-header for any block: open the block in edit mode, the **PDF sub-header** input is above the rich-text editor. Type your own (e.g. `OUR LIFETIME COMMITMENT`). Empty falls back to the default.

---

## 6. Per-salesperson messages + photos

The **Salesperson Message** content block isn't authored once for the whole org — every salesperson sets up their own personal welcome with photo, role, and sign-off.

1. `/manage` → Document Templates → **Salesperson Message** block.
2. Click **Edit team** (or the equivalent action in the editor).
3. The dialog lists every member of your organisation.
4. Click yourself (or another salesperson).
5. Fill in:
   - **Photo** — circular profile shot (uploaded to Firebase Storage).
   - **Role** — e.g. "Senior Sales Consultant" / "Boat Specialist".
   - **Message** — TipTap rich text. Personalise it.
   - **Sign-off** — e.g. "Looking forward to hearing from you" + your name.
6. **Save**.

When a customer's quote is generated, the PDF reads the salesperson profile of `quote.createdByUid` (whichever salesperson authored the quote) and renders THEIR message + photo. If a salesperson has no profile, the section is omitted.

---

## 7. Live PDF preview

Every content-block edit screen has a **PDF Preview** pane on the right showing the actual customer PDF live, updated 1.5s after edits settle.

### Header pills

The pills under "Quote PDF Preview" tell you the data state:

- **Vendor ✓ / Motor ✓ / Trailer ✓** — green when real Firestore data was loaded for the demo. Amber "missing" with tooltip when not.
- **Images N/M** — count of image URLs successfully preloaded as data URLs (so they actually render on the PDF). Click to expand the per-URL diagnostic.

### Focus mode

The **Focus** button in the header expands the preview to full-screen (good for fine detail). ESC closes.

### What the preview shows

The preview renders the **same `ProposalPDFDocument` component** as the actual customer PDF download. So what you see in the preview is what the customer gets — content blocks, brand overrides, sub-headers, motor + trailer detail, signatures, all of it.

---

## 8. Quote vs Contract targeting

Each content block can be tagged for **Quote**, **Contract**, or both. This controls which customer document the block appears on.

In edit mode, the **Appears on** chip multi-select sits below the rich-text editor. At least one document type must be selected.

The Document Templates surface has separate **Quote** and **Contract** sub-tabs, each filtering to blocks tagged for that document type.

---

## How customer PDFs are generated

1. Salesperson finalizes a quote (Finalize Quote dialog).
2. The system fetches the org's content blocks + sub-headers + drag-drop section order.
3. Resolves brand overrides for the quote's vendorId.
4. Resolves the per-salesperson profile from `quote.createdByUid`.
5. Pre-loads every image referenced by the PDF (cover, inline content-block images, motor + trailer photos, brand logos, salesperson photo) as base64 data URLs — bypasses cross-origin restrictions for any image that needs them.
6. Renders the full customer PDF and stores it under the quote's Storage path.

The same pipeline runs for the on-screen preview while you author.

---

## What v1.7 did NOT ship (deferred to v1.8)

- **6.4.1** — `dependsOn: string[]` schema on stories + UI validation
- **6.4.2** — Pre-merge regex check enforcing `DEPENDS ON x.y.z` references resolve before retargeting
- **6.4.3** — Doc-only "DEPENDS ON x.y.z" convention adopted across plan-rewrite seeds

These are process-discipline stories for the planning system itself, not customer-facing. Scheduled for v1.8 alongside the 1.8.1-dependent stories that ride the same convention.
