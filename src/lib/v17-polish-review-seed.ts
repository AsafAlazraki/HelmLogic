/**
 * v1.7 polish-review seed (planning-only).
 *
 * One-shot button that updates story docs to reflect the polish work
 * shipped after the v1.7 round-2 feedback cycle:
 *
 *   1.8.2  Image upload per content block (was v1.8)
 *     RETARGET v1.8 → v1.7
 *     APPEND acceptance: "✓ v1.7 ship: image extension added to
 *      FeatureRichTextEditor + Insert Image toolbar button +
 *      <img> rendering in lib/tiptap-pdf.tsx (Image component).
 *      Optional imageStoragePathPrefix prop gates the toolbar button."
 *     Points unchanged (2).
 *
 *   1.8.7  Live PDF preview pane
 *     APPEND acceptance: "✓ v1.7 polish: 1500ms debounce + useMemo
 *      on docElement so PDFViewer iframe doesn't regenerate per
 *      keystroke; 'Updating…' indicator while debounce settles."
 *     APPEND acceptance: "✓ v1.7 polish: Focus mode (Maximize2 button
 *      in header strip) opens a full-viewport overlay with PDFViewer
 *      + toolbar; ESC closes; only one PDFViewer instance renders at
 *      a time (no double-render lag)."
 *
 *   1.2.1  Branded PDF Quote Generation
 *     APPEND acceptance: "✓ v1.7 polish: section headers match the
 *      InnerHeader page-level style (bold italic uppercase title +
 *      uppercase letter-spaced sub-line + 2-px navy bottom border)
 *      across content-block sections, salesperson-message section,
 *      and T&Cs fallback."
 *
 *   1.8.12 Per-salesperson messages + photos
 *     APPEND acceptance: "✓ v1.7 ship: salesperson-message-editor.tsx
 *      lists org members; per-user TipTap message + photo (via
 *      PhotoUploader) + role + sign-off; persists to
 *      organisations/{orgId}/salesTeam/{userId}; PDF render reads
 *      from the resolved user."
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
        ],
    },
    {
        titlePrefix: '1.8.7 — Live PDF preview pane',
        appendAcceptance: [
            '✓ v1.7 polish: 1500ms debounce on PDF inputs + useMemo on docElement → PDFViewer iframe regenerates once when edits settle, not per keystroke. "Updating…" indicator with Loader2 spinner shown in header during debounce.',
            '✓ v1.7 polish: Focus mode (Maximize2 button in header strip) opens a full-viewport overlay with PDFViewer + toolbar; ESC closes; only one PDFViewer instance rendered at a time so the inline + focused render don\'t double-up.',
            '✓ v1.7 polish: section headers in proposal-pdf.tsx match the InnerHeader page-level style (bold italic uppercase + uppercase letter-spaced sub + 2-px navy bottom border).',
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
