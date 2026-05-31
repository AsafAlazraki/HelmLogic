/**
 * v1.10 — Epic 11 "Service Quoting" seed (NSM-Hub absorption).
 *
 * Seeds the planning-system Epic + its stories for absorbing NSM-Hub's
 * Service Quoting module into HelmLogic (see tasks/nsm-hub-merge-plan.md).
 * Folded into the Auto-Apply button so the restructure AND the new
 * Service Quoting backlog land in one click ("all done at once").
 *
 * Sizing derived from a direct read of the NSM-Hub repo (cloned while
 * public): `quotes` + `catalogueOperations` + `catalogueParts`
 * collections, a 4-step create wizard (user → customer/asset →
 * operations → summary), the OperationForm (labor rate×hours + parts
 * field-array), catalogue admin CRUD, status lifecycle (Estimate →
 * Approved → Complete / Cancelled), and a print-page PDF.
 *
 * Idempotent: matches the epic by title and each story by its "11.x.y"
 * title prefix; re-running creates only what's missing.
 *
 * One-shot lifecycle: this module + its hook in the Auto-Apply flow are
 * removed in the cleanup commit after the seed has run, per CONVENTIONS.md.
 */

import {
    addDoc,
    collection,
    getDocs,
    serverTimestamp,
    type Firestore,
} from 'firebase/firestore';
import type { EpicDoc, FeatureDoc } from '@/components/feature-tracking-board';

/** The epic to create (matched by title for idempotency). */
export const SERVICE_QUOTING_EPIC: Pick<EpicDoc, 'title' | 'shortLabel' | 'color' | 'order' | 'status'> & { description: string } = {
    title: 'Service Quoting (NSM-Hub absorption)',
    shortLabel: 'Service Quoting',
    description:
        'Absorb NSM-Hub\'s Service Quoting module into HelmLogic as a new dealer-ops surface: quote a customer\'s service work (labor + parts per operation), backed by a service catalogue, with zero-downtime migration of all existing NSM-Hub service-quote data. Distinct from HL\'s boat-sale CPQ.',
    color: 'emerald',
    order: 1100,
    status: 'planning',
};

export interface SeedStory {
    /** Canonical "11.x.y" prefix used for idempotency + title. */
    prefix: string;
    title: string;
    points: number;
    type: FeatureDoc['type'];
    priority: FeatureDoc['priority'];
    targetRelease: string;
    description: string;
    acceptanceCriteria: string[];
}

/** Epic 11 stories, sized from the NSM-Hub read. Bands respect build
 *  order (schema → catalog → form → view → PDF → migration → cutover)
 *  and the dealer-ops priority window (v1.10–v1.13). */
export const SERVICE_QUOTING_STORIES: SeedStory[] = [
    {
        prefix: '11.1.1',
        title: '11.1.1 — Service-quote schema + collections + rules',
        points: 3, type: 'feature', priority: 'high', targetRelease: 'v1.10',
        description: 'Foundation: port the NSM-Hub service-quote data model into HL conventions and stand up the Firestore collections + rules.',
        acceptanceCriteria: [
            'src/lib/service-quote.ts — Quote / Operation / Part types ported to HL conventions (Timestamps, organisationId denormalised, audit fields).',
            'src/lib/service-catalogue.ts — CatalogueOperation / CataloguePart types.',
            'Collections under organisations/{orgId}: serviceQuotes, serviceOperations, serviceParts.',
            'firestore.rules — paths for the three collections (signed-in, org-scoped).',
            'Service quotes are kept clearly separate from HL boat-sale quotes (different collection, different lifecycle).',
        ],
    },
    {
        prefix: '11.1.2',
        title: '11.1.2 — Service catalogue admin (operations + parts)',
        points: 5, type: 'feature', priority: 'high', targetRelease: 'v1.10',
        description: 'Admin CRUD for the predefined service-operations + service-parts libraries the quote form draws from. Ports catalogue/operations + catalogue/parts pages.',
        acceptanceCriteria: [
            'Operations catalogue: create / edit / delete predefined operations (heading, description, laborRate, laborHours, default parts).',
            'Parts catalogue: create / edit / delete predefined parts (name, cost, costIncGst).',
            'Upsert by natural key (heading / name) — never clear-and-replace (v1.4 import lesson).',
            'Picker dialogs (insert a catalogue operation / part into a quote operation) ported for use by the create form.',
            'Lives under /manage or a Service-Quoting admin surface, gated on org-admin permission.',
        ],
    },
    {
        prefix: '11.1.3',
        title: '11.1.3 — Service-quote create wizard (4-step)',
        points: 8, type: 'feature', priority: 'high', targetRelease: 'v1.11',
        description: 'The multi-step create flow: user/ref → customer + asset → operations → summary. Ports QuoteCreationForm + its 4 steps with auto-save.',
        acceptanceCriteria: [
            'Step 1 user/ref (auto-filled from profile); Step 2 customer + boat/motor/trailer; Step 3 operations; Step 4 summary + save.',
            'Step indicator + back/next navigation; validation per step via react-hook-form + zod.',
            'Auto-save draft (status Work-In-Progress) so an interrupted quote isn\'t lost — mirrors NSM-Hub autoSaveQuote.',
            'New operations the user authors can be pushed back to the catalogue (opt-in), matching NSM-Hub behaviour.',
        ],
    },
    {
        prefix: '11.1.4',
        title: '11.1.4 — Operation editor (labor + multi-part)',
        points: 3, type: 'feature', priority: 'high', targetRelease: 'v1.11',
        description: 'The core operation line editor: labor rate × hours + a field-array of parts, with live cost totals and catalogue insert.',
        acceptanceCriteria: [
            'Labor: rate (default 144.54) × hours → live labor cost.',
            'Parts: add/remove multiple parts (field-array), each cost + qty, ex + inc GST.',
            'Operation total = labor + parts; quote total rolls up all operations.',
            'Insert from parts catalogue dialog; customerNotes per operation.',
            'Inc-GST rounding uses HL convention (Math.ceil on inc-GST totals).',
        ],
    },
    {
        prefix: '11.2.1',
        title: '11.2.1 — Service-quote dashboard + cards',
        points: 3, type: 'feature', priority: 'medium', targetRelease: 'v1.11',
        description: 'Dashboard of service-quote cards with status filters. Ports QuoteCard + the service-hub list pages.',
        acceptanceCriteria: [
            'Card grid showing quote number, customer, boat, total, status pill.',
            'Filter by status (Estimate / Approved / Complete / Cancelled) + estimateType.',
            'Search by customer / quote number; sort by date.',
            'Click a card → service-quote view.',
        ],
    },
    {
        prefix: '11.2.2',
        title: '11.2.2 — Service-quote view/edit + status lifecycle',
        points: 5, type: 'feature', priority: 'high', targetRelease: 'v1.12',
        description: 'View + edit a service quote with its status state machine. Ports QuoteView (the 829-line core) onto HL.',
        acceptanceCriteria: [
            'Status lifecycle: Work-In-Progress → Estimate → Pending → Approved → Complete / Cancelled.',
            'estimateType selector (Installation / Insurance / Mechanical Estimate).',
            'Edit operations after creation; version + history retained (mirrors NSM-Hub version/history fields).',
            'Read-only once Complete / Cancelled (isActionable gate).',
            'Reuse HL\'s audit-log pattern (1.4.1) for status transitions if cheap.',
        ],
    },
    {
        prefix: '11.2.3',
        title: '11.2.3 — Service-quote PDF (HL @react-pdf)',
        points: 5, type: 'feature', priority: 'high', targetRelease: 'v1.12',
        description: 'Rebuild the service-quote PDF on HL\'s @react-pdf pipeline (NSM-Hub used a print-page). New service template: operations with labor + parts + totals, brand styling.',
        acceptanceCriteria: [
            'Service-quote PDF template on @react-pdf, reusing HL\'s image-preload + brand-styling patterns from renderQuotePdf.',
            'Renders per-operation labor + parts breakdown + quote totals (ex/inc GST).',
            'Org logo + brand colours; customer + asset header block.',
            'Download + (later) attach to the existing Send pipeline.',
        ],
    },
    {
        prefix: '11.3.1',
        title: '11.3.1 — Customer reconciliation (NSM → HL)',
        points: 3, type: 'feature', priority: 'high', targetRelease: 'v1.10',
        description: 'Link service quotes to HL\'s existing customers collection rather than a parallel set; snapshot on the quote like HL boat-quotes.',
        acceptanceCriteria: [
            'Match NSM-Hub customers to HL customers on name + phone/email; create canonical record where missing.',
            'Service quote references the canonical customerId + embeds a snapshot.',
            'No parallel/duplicate customer set introduced.',
        ],
    },
    {
        prefix: '11.3.2',
        title: '11.3.2 — Migration tooling (bulk + delta-sync)',
        points: 8, type: 'feature', priority: 'critical', targetRelease: 'v1.12',
        description: 'Zero-downtime migration of NSM-Hub service-quote data. Daily active use → bulk migrate + continuous delta-sync until cutover.',
        acceptanceCriteria: [
            'Firebase Admin SDK script, dual-project (reads nsm-service-quotation, writes HL).',
            'Order: catalogueOperations + catalogueParts → customers (reconcile) → quotes (remap customer + uid refs).',
            'Idempotent upsert by natural key; reports counts; re-runnable.',
            'Continuous delta-sync (updatedAt > lastSync) keeps HL current under daily writes.',
            'uid-mapping table (NSM uid → HL uid) so migrated quotes keep correct ownership.',
            'DEPENDS ON a read service-account for the nsm-service-quotation project (pre-flight admin task).',
        ],
    },
    {
        prefix: '11.3.3',
        title: '11.3.3 — Cutover + verification + decommission',
        points: 3, type: 'task', priority: 'high', targetRelease: 'v1.13',
        description: 'Final delta pass, switch NSM staff to HL, verify, retire the NSM-Hub service-quote surface.',
        acceptanceCriteria: [
            'Tight off-hours cutover: final delta pass + flip staff to HL (minutes-long freeze, not hours).',
            'Reconcile record counts + spot-check migrated PDFs.',
            'Confirm no NSM-Hub service-quote writes post-cutover; decommission the NSM-Hub surface.',
        ],
    },
];

export interface ServiceQuotingSeedPlan {
    /** True when the epic doesn't exist yet and will be created. */
    epicToCreate: boolean;
    /** Existing epic id when already present (stories attach to it). */
    existingEpicId: string | null;
    /** Stories that will be created (not already present by prefix). */
    toCreate: SeedStory[];
    /** Count already present (idempotency). */
    alreadyPresent: number;
    /** Total points across the stories that will be created. */
    pointsToCreate: number;
}

/** Compute what the seed will do — pure, for the confirm dialog. */
export function computeServiceQuotingSeed(
    features: FeatureDoc[],
    epics: EpicDoc[],
): ServiceQuotingSeedPlan {
    const existingEpic = epics.find(e => (e.title ?? '').trim() === SERVICE_QUOTING_EPIC.title);
    const existingTitles = new Set(features.map(f => (f.title ?? '').trim()));

    const toCreate = SERVICE_QUOTING_STORIES.filter(s => {
        // Match by prefix at the front of any existing title.
        for (const t of existingTitles) {
            if (t.startsWith(s.prefix)) return false;
        }
        return true;
    });

    return {
        epicToCreate: !existingEpic,
        existingEpicId: existingEpic?.id ?? null,
        toCreate,
        alreadyPresent: SERVICE_QUOTING_STORIES.length - toCreate.length,
        pointsToCreate: toCreate.reduce((s, x) => s + x.points, 0),
    };
}

export interface ServiceQuotingSeedResult {
    epicCreated: boolean;
    storiesCreated: number;
    failed: number;
}

/** Apply the seed — create the epic (if needed) + the missing stories. */
export async function applyServiceQuotingSeed(
    firestore: Firestore,
    plan: ServiceQuotingSeedPlan,
): Promise<ServiceQuotingSeedResult> {
    let epicId = plan.existingEpicId;
    let epicCreated = false;

    if (plan.epicToCreate) {
        const ref = await addDoc(collection(firestore, 'epics'), {
            title: SERVICE_QUOTING_EPIC.title,
            shortLabel: SERVICE_QUOTING_EPIC.shortLabel,
            description: SERVICE_QUOTING_EPIC.description,
            color: SERVICE_QUOTING_EPIC.color,
            order: SERVICE_QUOTING_EPIC.order,
            status: SERVICE_QUOTING_EPIC.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        epicId = ref.id;
        epicCreated = true;
    }

    let storiesCreated = 0;
    let failed = 0;
    for (const s of plan.toCreate) {
        try {
            await addDoc(collection(firestore, 'features'), {
                title: s.title,
                description: s.description,
                type: s.type,
                status: 'planned',
                priority: s.priority,
                targetRelease: s.targetRelease,
                points: s.points,
                acceptanceCriteria: s.acceptanceCriteria,
                epicId,
                order: 0,
                submitterName: 'NSM-Hub absorption seed',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            storiesCreated++;
        } catch (e) {
            console.error('[service-quoting-seed] create failed for', s.prefix, e);
            failed++;
        }
    }

    return { epicCreated, storiesCreated, failed };
}

/** Per-release points the seed adds — feeds the capacity preview so the
 *  dialog shows the TRUE post-seed capacity (restructure + new stories). */
export function seedPointsByRelease(plan: ServiceQuotingSeedPlan): Record<string, { count: number; points: number }> {
    const out: Record<string, { count: number; points: number }> = {};
    for (const s of plan.toCreate) {
        (out[s.targetRelease] ??= { count: 0, points: 0 });
        out[s.targetRelease].count += 1;
        out[s.targetRelease].points += s.points;
    }
    return out;
}
