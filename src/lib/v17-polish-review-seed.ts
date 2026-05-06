/**
 * v1.7 polish-review seed (planning-only).
 *
 * One-shot button that updates story docs to reflect the polish work
 * shipped across rounds 2–7 of the v1.7 feedback cycle:
 *
 *   1.8.2  Image upload per content block (was v1.8)
 *          RETARGET v1.8 → v1.7. Image extension + width/align attrs
 *          + contextual toolbar (size/align/replace/remove) + JPG/PNG
 *          format restriction + Word-style text wrap (round-7).
 *
 *   1.8.7  Live PDF preview pane — debounce + memoize, focus mode,
 *          cover-as-data-URL pre-fetch (round-4 first-page lag fix),
 *          real motor + trailer + vendor logo Firestore overlays.
 *
 *   1.8.10 Real-data fetcher path (canonical Firestore reads).
 *
 *   1.2.1  Branded PDF Quote Generation — cover redesign, polished
 *          section headers, model-name overlap fix, per-block pages
 *          with own InnerHeaders (round-5), customisable sub-header
 *          per block.
 *
 *   1.8.12 Per-salesperson messages + photos — schema + editor + PDF.
 *
 * Idempotent — only writes if the new acceptance line isn't already
 * present (skip-if-includes check).
 */

import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';

interface StoryUpdate {
    titlePrefix: string;
    appendAcceptance: string[];
    retargetTo?: string;
}

const UPDATES: StoryUpdate[] = [
    {
        titlePrefix: '1.8.2 — Image upload per content block',
        retargetTo: 'v1.7',
        appendAcceptance: [
            '✓ v1.7 ship: image extension added to FeatureRichTextEditor + Insert Image toolbar button. Optional imageStoragePathPrefix prop gates the button. lib/tiptap-pdf.tsx renders <img> tags as @react-pdf <Image> components in the customer PDF.',
            '✓ v1.7 ship: same uploader path (uploadFileToStorage) shared with 1.8.12 salesperson photos; consistent timestamped-filename convention.',
            '✓ v1.7 round-5: ResizableImage extension adds width (25/50/75/100%) + align (left/center/right) attributes serialised as data-width/data-align on the <img> tag for the PDF parser, plus inline style for the editor view. tiptap-pdf.tsx wraps the @react-pdf <Image> in a sized <View> with explicit width — fixes the bug where images visible in the editor rendered as nothing in the PDF (no-width @react-pdf collapse).',
            '✓ v1.7 round-5: contextual image toolbar — Size pills (25%/50%/75%/100%), three Align buttons (left/center/right), Replace (preserves current size + align), and Remove. Click outside the image to dismiss the contextual row.',
            '✓ v1.7 round-6: upload-time format restriction — JPG/PNG only (matches what @react-pdf supports). SVG / WebP / GIF rejected at upload with a clear toast. Existing unsupported images render an amber "cannot render on PDF — use JPG/PNG" placeholder block on the customer PDF instead of silently disappearing.',
            '✓ v1.7 round-7: standard text toolbar (H2/H3/Bold/Italic/lists/link/insert-image/undo/redo) always visible — image controls appear as a SECOND row below it when an image is selected. Earlier round-5 hid text controls; that was wrong.',
            '✓ v1.7 round-7: Word-style text wrap. Left/right alignment with width < 100% floats the image (CSS float in editor, flexDirection row in @react-pdf) so the next paragraph(s) flow around it. Center / 100% width stays block-level. Tooltips communicate the new behaviour: "Align left — text wraps to the right".',
        ],
    },
    {
        titlePrefix: '1.8.7 — Live PDF preview pane',
        appendAcceptance: [
            '✓ v1.7 polish: 1500ms debounce on PDF inputs + useMemo on docElement → PDFViewer iframe regenerates once when edits settle, not per keystroke. "Updating…" indicator with Loader2 spinner shown in header during debounce.',
            '✓ v1.7 polish: Focus mode (Maximize2 button in header strip) opens a full-viewport overlay with PDFViewer + toolbar; ESC closes; only one PDFViewer instance rendered at a time so the inline + focused render don\'t double-up.',
            '✓ v1.7 polish: section headers in proposal-pdf.tsx match the InnerHeader page-level style (bold italic uppercase + uppercase letter-spaced sub + 2-px navy bottom border).',
            '✓ v1.7 round-4: cover image pre-fetched as a base64 data URL (FileReader + fetch) and passed to the PDFViewer in place of the remote URL. @react-pdf no longer re-fetches the cover on every regeneration → first-page lag eliminated. Falls through to the URL form on CORS / network failure.',
            '✓ v1.7 round-4: real Firestore data overlays — preview fetches a real motor (vendorType=Motor Brand → first dataSet → first row in 75–100 HP envelope with image), a real trailer (walks the 7 trailer-brand vendor IDs from seed-trailers.ts, picks first with imageUrl + boatSizeMtr 5–6.5 m), and the Highfield vendor logo. No Unsplash / no invented brands. Sections fall back to placeholders only when Firestore data isn\'t seeded.',
        ],
    },
    {
        titlePrefix: '1.8.10',
        appendAcceptance: [
            '✓ v1.7 round-4: real-data fetcher in content-blocks-pdf-preview.tsx pulls live motor + trailer + vendor logo from Firestore via canonical paths (data-warehouse/{motorVendorId}/dataSets/{ds}/rows for motors; data-warehouse/{trailerVendorId}/series/{s}/trailers for trailers). Builds spliceable overrides that flow through buildSampleQuoteFixture so financials recompute against real prices.',
        ],
    },
    {
        titlePrefix: '1.2.1 — Branded PDF Quote Generation',
        appendAcceptance: [
            '✓ v1.7 polish: cover page redesigned — full-bleed background image (with deep-navy fallback), soft top-down white gradient for logo legibility (replaces hard 80-px white bar), bottom-up navy gradient for customer-info legibility.',
            '✓ v1.7 polish: section headers across all content blocks now use the InnerHeader page-level style (bold italic uppercase title + uppercase letter-spaced sub + 2-px navy bottom border) instead of the tiny "CAD-style" label.',
            '✓ v1.7 polish round-3: cover model-name overlap fixed — title fontSize 56 + lineHeight 1.05 + marginBottom 14 keeps clear of the model-code line below (italic descenders no longer collide).',
            '✓ v1.7 polish round-3: cover top-right brand cascade — three stacked pills "VESSEL · POWERED BY · TRAILER BY" with logo OR brand-name fallback; vendor pill is the prominent one (taller, fuller white), motor + trailer pills are smaller. Each pill auto-falls-back to typographic brand name when no logoUrl is set.',
            '✓ v1.7 polish round-3: motor section on page 2 (Vessel Configuration) expanded to render hero photo + brand logo + 4-up specifications grid (HP / shaft / control / starting / tilt-trim / fuel / prop / warranty) + categorised accessories list with prices + motor subtotal.',
            '✓ v1.7 polish round-3: trailer section on page 2 mirrors the motor layout — hero photo + brand logo + spec grid (suits-boat / length / width / ATM / tare / axle / wheels / brakes / winch / coupling / lights / construction) + categorised options list + trailer subtotal. Replaces the earlier single-row badge layout.',
            '✓ v1.7 polish round-3: sample-quote-fixture (Highfield Sport 560) is now fully-specced — motor has hpRating/shaftLength/control/starting/tiltTrim/fuelTank/prop/warranty + imageUrl + 3 categorised accessories; trailer has catalog.specifications + imageUrl + 2 categorised options; preview renders a heavy customer-style proposal end-to-end.',
            '✓ v1.7 round-4: cover brand cascade reverted to a single right-side vendor logo (no more VESSEL/POWERED BY/TRAILER BY pills). Fixture stripped of all fake data — Unsplash motor + trailer photos removed, fake "Stratos" brand replaced with NSM Custom Trailers (real vendor from the catalog), invented motor accessory categories ("Instrumentation/Performance/Steering & Control") replaced with the only three the app actually uses (Propeller / Rigging / Other per motor-options.tsx).',
            '✓ v1.7 round-5: each content block renders as its OWN <Page> with its OWN InnerHeader matching the block type — fixes the orphan-content-under-mismatched-system-header bug ("Why Choose Us" appearing under the "Vessel Configuration" page header). Document order: Cover → zoneA blocks (one page each) → Vessel Configuration → zoneB blocks → Investment Summary → zoneC blocks → Acceptance (signatures). Page numbers dynamic via @react-pdf render prop (no more hardcoded "02"/"03").',
            '✓ v1.7 round-5: author-customisable PDF sub-header per content block. ContentBlock schema gains optional subHeader field; edit dialog has a "PDF sub-header" input above the rich-text editor. Empty falls back to SECTION_SUB defaults. New parallel resolveContentBlockSubHeadersForQuote() resolver threaded through preview + download + finalize so the customer PDF honours authored sub-headers.',
        ],
    },
    {
        titlePrefix: '1.8.12 — Per-salesperson messages',
        appendAcceptance: [
            '✓ v1.7 ship: salesperson-message-editor.tsx lists org members; per-user TipTap message + photo upload (via PhotoUploader) + role + sign-off; persists to organisations/{orgId}/salesTeam/{userId}.',
            '✓ v1.7 ship: PDF render reads from the resolved salesTeam doc using quote.createdByUid; falls back to omitting the section when no profile exists for the creator.',
            '✓ v1.7 ship: section uses the polished InnerHeader-style header with circular salesperson photo + name + role line.',
        ],
    },
];

export interface PolishReviewSummary {
    storiesUpdated: number;
    storiesSkipped: number;
    retargetsApplied: number;
    storiesMissed: string[];
}

export async function applyV17PolishReview(firestore: Firestore): Promise<PolishReviewSummary> {
    let storiesUpdated = 0;
    let storiesSkipped = 0;
    let retargetsApplied = 0;
    const storiesMissed: string[] = [];

    const existing = await getDocs(collection(firestore, 'features'));
    interface ExistingDoc { id: string; data: any; title: string; }
    const allExisting: ExistingDoc[] = [];
    existing.forEach(d => {
        const data = d.data();
        const t = (data.title as string | undefined)?.trim() ?? '';
        allExisting.push({ id: d.id, data, title: t });
    });

    for (const u of UPDATES) {
        const target = allExisting.find(d => d.title.startsWith(u.titlePrefix));
        if (!target) {
            storiesMissed.push(u.titlePrefix);
            continue;
        }
        const currentAc: string[] = Array.isArray(target.data.acceptanceCriteria)
            ? target.data.acceptanceCriteria
            : [];
        const newLines = u.appendAcceptance.filter(line => !currentAc.includes(line));
        const releaseDiffers = u.retargetTo !== undefined && target.data.targetRelease !== u.retargetTo;

        if (newLines.length === 0 && !releaseDiffers) {
            storiesSkipped++;
            continue;
        }

        const patch: Record<string, any> = { updatedAt: serverTimestamp() };
        if (newLines.length > 0) patch.acceptanceCriteria = [...currentAc, ...newLines];
        if (releaseDiffers) {
            patch.targetRelease = u.retargetTo;
            retargetsApplied++;
        }
        await updateDoc(doc(firestore, 'features', target.id), patch);
        storiesUpdated++;
    }

    return { storiesUpdated, storiesSkipped, retargetsApplied, storiesMissed };
}
