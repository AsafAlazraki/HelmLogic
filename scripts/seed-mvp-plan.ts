/**
 * Seed the v1.6 MVP plan into Firestore.
 *
 * Creates the 5 Epics and the 22 Feature stories from the stakeholder
 * MVP spec (`tasks/v1.6-planning-system-design.md` §6). Idempotent —
 * skips epics whose doc already exists, skips features whose title is
 * already present in the live snapshot.
 *
 * Usage:
 *   npx tsx scripts/seed-mvp-plan.ts            # dry-run — print what would happen
 *   npx tsx scripts/seed-mvp-plan.ts --live     # actually write to Firestore
 *
 * Auth: anonymous Firebase user (no organisationId, so isSubDealer() is
 * false → rules allow features+epics writes). Same pattern as
 * scripts/create-trailers-module.ts.
 */

const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');

const PROJECT_ID = 'studio-2290360004-3b963';
const API_KEY = 'AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ---------------------------------------------------------------------------
// Firestore REST helpers (cribbed from create-trailers-module.ts)
// ---------------------------------------------------------------------------

function toFsVal(v: any): any {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
        if (Number.isInteger(v)) return { integerValue: String(v) };
        return { doubleValue: v };
    }
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsVal) } };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (typeof v === 'object') {
        const fields: Record<string, any> = {};
        for (const [k, val] of Object.entries(v)) {
            if (val !== undefined) fields[k] = toFsVal(val);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}

function toFsDoc(data: Record<string, any>): any {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) fields[k] = toFsVal(v);
    }
    return { fields };
}

async function getAnonymousToken(): Promise<string> {
    const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnSecureToken: true }),
        },
    );
    if (!resp.ok) throw new Error(`Auth failed: ${resp.status} ${await resp.text()}`);
    const json: any = await resp.json();
    return json.idToken;
}

async function fsGet(token: string, path: string): Promise<any | null> {
    const resp = await fetch(`${FS_BASE}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status} ${await resp.text()}`);
    return resp.json();
}

async function fsList(token: string, collectionPath: string, pageSize = 200): Promise<any[]> {
    const url = `${FS_BASE}/${collectionPath}?pageSize=${pageSize}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`LIST ${collectionPath} failed: ${resp.status} ${await resp.text()}`);
    const json: any = await resp.json();
    return json.documents ?? [];
}

/** Use `documentId=` query param so we control the doc id (required for stable epic ids). */
async function fsCreate(token: string, collectionPath: string, docId: string, data: Record<string, any>): Promise<void> {
    const url = `${FS_BASE}/${collectionPath}?documentId=${encodeURIComponent(docId)}`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(toFsDoc(data)),
    });
    if (!resp.ok) throw new Error(`CREATE ${collectionPath}/${docId} failed: ${resp.status} ${await resp.text()}`);
}

/** Auto-id create — for features. Returns the resulting doc name. */
async function fsAdd(token: string, collectionPath: string, data: Record<string, any>): Promise<string> {
    const resp = await fetch(`${FS_BASE}/${collectionPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(toFsDoc(data)),
    });
    if (!resp.ok) throw new Error(`ADD ${collectionPath} failed: ${resp.status} ${await resp.text()}`);
    const json: any = await resp.json();
    return json.name as string;
}

/** Read string field from a Firestore REST doc. */
function readStr(doc: any, field: string): string | undefined {
    return doc?.fields?.[field]?.stringValue;
}

// ---------------------------------------------------------------------------
// Seed payloads — 5 Epics
// ---------------------------------------------------------------------------

interface SeedEpic {
    /** Stable slug used as the doc id and FK target on features. */
    id: string;
    title: string;
    shortLabel: string;
    description: string;
    color: 'blue' | 'amber' | 'violet' | 'emerald' | 'rose' | 'indigo' | 'slate';
    order: number;
    status: 'planning' | 'active' | 'done';
}

const EPICS: SeedEpic[] = [
    {
        id: 'guided-configuration',
        title: 'Guided Configuration & Quote Creation',
        shortLabel: 'Guided Config',
        description: 'Validated configuration flow + branded customer-ready proposal output. The SCIBS demo win — emotional + technically accurate.',
        color: 'blue',
        order: 100,
        status: 'active',
    },
    {
        id: 'pricing-accuracy',
        title: 'Pricing Accuracy & Margin Protection',
        shortLabel: 'Pricing',
        description: 'All quote line pricing sourced from approved lists with audit trail; margin enforcement with GM override; post-contract variations.',
        color: 'amber',
        order: 200,
        status: 'planning',
    },
    {
        id: 'data-management',
        title: 'Data Management & Sustainability',
        shortLabel: 'Data',
        description: 'Structured imports with versioning + manual approval; consistent internal data model; controlled crowdsourced suggestions with audit.',
        color: 'violet',
        order: 300,
        status: 'planning',
    },
    {
        id: 'promotions',
        title: 'Promotions & Commercial Flexibility',
        shortLabel: 'Promotions',
        description: 'Manual promo entry across $/HP, $/foot, %, and fixed rebate forms; alerts when a quote includes an item with active promo.',
        color: 'emerald',
        order: 400,
        status: 'planning',
    },
    {
        id: 'security-extensibility',
        title: 'Security, Extensibility & Dealer Model',
        shortLabel: 'Security',
        description: 'Hull-only / engine-only / trailer-only quoting; brand & dealer isolation (no cross-brand or cross-dealer leakage); brand onboarding without code changes.',
        color: 'rose',
        order: 500,
        status: 'planning',
    },
];

// ---------------------------------------------------------------------------
// Seed payloads — Features (Epic 1 in this commit; Epics 2-5 next turn)
// ---------------------------------------------------------------------------

interface SeedFeature {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    type: 'feature' | 'bug' | 'improvement';
    priority: 'critical' | 'high' | 'medium' | 'low' | 'nice-to-have';
    targetRelease: string | null;
    points: number | null;
    epicId: string;
}

/** "As a ... I want ... So that ..." description in TipTap-friendly HTML. */
function story(role: string, want: string, so: string): string {
    return `<p><strong>As a</strong> ${role}<br><strong>I want</strong> ${want}<br><strong>So that</strong> ${so}.</p>`;
}

const EPIC_1_FEATURES: SeedFeature[] = [
    {
        title: '1.1.1 — Enforced Configuration Sequence',
        description: story('salesperson', 'to be guided through a fixed configuration sequence', 'I cannot accidentally build an invalid boat package'),
        acceptanceCriteria: [
            'Order: Hull → Manufacturer options → Engine(s) & rigging → Trailer → Dealer fit options & accessories → Dealer fit-out charge',
            'Steps cannot be skipped',
            'System always maintains a valid state',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 2, epicId: 'guided-configuration',
    },
    {
        title: '1.1.2 — Compatibility Rule Enforcement',
        description: story('salesperson', 'the system to prevent incompatible combinations', 'I never quote an unbuildable package'),
        acceptanceCriteria: [
            'Hard rules between Hull ↔ Engine, Hull ↔ Trailer, Hull ↔ Manufacturer options',
            'Invalid combinations cannot be saved',
            'Invalid combinations cannot be quoted',
            'User sees a clear validation error',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration',
    },
    {
        title: '1.1.3 — Multiple Quote Scenarios',
        description: story('salesperson', 'to create multiple quote versions for one customer', 'I can easily present alternatives'),
        acceptanceCriteria: [
            'Quote can be duplicated into new versions',
            'Versions are clearly labelled (e.g. Option A / Option B)',
            'Only one version can be marked Finalised',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration',
    },
    {
        title: '1.2.1 — Branded PDF Quote Generation',
        description: story('salesperson', 'the system to generate a professional customer-ready quote', 'I can present the boat as a premium ownership experience'),
        acceptanceCriteria: [
            'Personalised salesperson message',
            'Why Northside Marine + Life Beyond the Shore positioning',
            'End-to-end ownership support',
            'Brand & model story',
            'Configured boat summary (visual, not SKU tables)',
            'After-sales confidence & warranties',
            'Finance & insurance (informational)',
            'Value summary',
            'No system IDs or SKU codes are visible',
        ],
        type: 'feature', priority: 'critical', targetRelease: 'v1.7', points: 8, epicId: 'guided-configuration',
    },
    {
        title: '1.2.2 — Brand-Aware Content Injection',
        description: story('salesperson', 'brand-specific content to auto-populate', 'the quote is accurate and on-brand every time'),
        acceptanceCriteria: [
            'Correct logos, imagery, and copy load per brand',
            'No cross-brand content leakage',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration',
    },
    {
        title: '1.2.3 — Controlled Personalisation',
        description: story('salesperson', 'to personalise parts of the quote safely', 'the document remains professional and consistent'),
        acceptanceCriteria: [
            'Only approved text sections are editable',
            'Document structure cannot be broken',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration',
    },
    {
        title: '1.3.1 — Finalised Quote Locking',
        description: story('sales manager', 'finalised quotes to be locked', 'commercial integrity is preserved'),
        acceptanceCriteria: [
            'Finalised quotes are read-only',
            'Changes require a variation workflow',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.7', points: 1, epicId: 'guided-configuration',
    },
    {
        title: '1.3.2 — Contract Signing Pack Generation',
        description: story('salesperson', 'a complete signing pack generated automatically', 'the customer can sign without manual assembly'),
        acceptanceCriteria: [
            'Pack includes: Final quote, Payment plan expectations, T&Cs, Configuration summary',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration',
    },
    {
        title: '1.3.3 — SharePoint Quote Storage',
        description: story('staff member', 'finalised quotes stored in SharePoint', 'customers can be supported when the salesperson is unavailable'),
        acceptanceCriteria: [
            'PDF is automatically written to SharePoint',
            'Location is configurable',
            'Access controlled by permissions',
            'Requires Azure AD app registration + Files.ReadWrite.All on the target site',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration',
    },
];

const EPIC_2_FEATURES: SeedFeature[] = [
    {
        title: '2.1.1 — Structured Price Sources',
        description: story('finance stakeholder', 'all prices sourced from approved lists', 'pricing is accurate and auditable'),
        acceptanceCriteria: [
            'Prices originate from: Vendor/distributor price lists, Internal fit-out tables',
            'Each line shows source reference & last updated date',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.8', points: 2, epicId: 'pricing-accuracy',
    },
    {
        title: '2.1.2 — Model-Specific Fit-Out Pricing (Basic / Moderate / Complex)',
        description: story('salesperson', 'model-specific fit-out tiers', 'labour pricing matches reality'),
        acceptanceCriteria: [
            'Each model supports Basic / Moderate / Complex tiers',
            'Pricing examples from spec: Stabicraft 2350 = $2,800 / $5,500 / $7,800; Surtees GF770 has different numbers for similar size',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8', points: 5, epicId: 'pricing-accuracy',
    },
    {
        title: '2.2.1 — Margin Threshold Enforcement + GM Override',
        description: story('sales manager', 'low-margin quotes blocked by default', 'we protect profitability'),
        acceptanceCriteria: [
            'Quotes below threshold cannot be sent',
            'GM Sales & Marketing can override',
            'Overrides are fully auditable',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8', points: 5, epicId: 'pricing-accuracy',
    },
    {
        title: '2.2.2 — Role-Based Margin Visibility',
        description: story('salesperson', 'simple margin signals', 'I know when a deal is healthy'),
        acceptanceCriteria: [
            'Sales see Target margin %',
            'Sales see Margin band (Green / Amber / Red)',
            'Cost detail hidden where appropriate (e.g. internal fit-out items)',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.8', points: 3, epicId: 'pricing-accuracy',
    },
    {
        title: '2.3.1 — Quote Variations (post-contract)',
        description: story('salesperson', 'to make controlled changes after signing', 'customer changes are handled professionally'),
        acceptanceCriteria: [
            'Items can be added or removed',
            'Price delta clearly shown',
            'Deal totals and margin recalculated',
            'Original contract remains unchanged (locked baseline)',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.9', points: 8, epicId: 'pricing-accuracy',
    },
];

const EPIC_3_FEATURES: SeedFeature[] = [
    {
        title: '3.1.1 — Structured Data Imports + Versioning + Manual Approval',
        description: story('administrator', 'to import structured data', 'HelmLogic stays up to date efficiently'),
        acceptanceCriteria: [
            'Supports import of pricing, specs, photos, marketing copy',
            'Versioning applied',
            'Manual approval before publish',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.9', points: 5, epicId: 'data-management',
    },
    {
        title: '3.2.1 — Internal Data Normalisation Layer',
        description: story('product owner', 'consistent internal data structures', 'quoting logic remains stable'),
        acceptanceCriteria: [
            'All imported data is normalised',
            'NSM-specific overlays supported (descriptions, talking points, brand narrative)',
        ],
        type: 'feature', priority: 'low', targetRelease: 'v1.9', points: 3, epicId: 'data-management',
    },
    {
        title: '3.3.1 — Crowdsourced Suggestions with Audit',
        description: story('user', 'to flag errors or suggest improvements', 'data accuracy improves over time'),
        acceptanceCriteria: [
            'Suggestions require review & publish by an authorised role',
            'Full edit history retained',
            'Sub-dealer permissions enforced (must not leak across brands/dealers)',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.9', points: 5, epicId: 'data-management',
    },
];

const EPIC_4_FEATURES: SeedFeature[] = [
    {
        title: '4.1.1 — Promotion Entry (manual, all forms)',
        description: story('salesperson', 'to manually enter promotions', 'real-world deals can be quoted'),
        acceptanceCriteria: [
            'Supports $ off per HP',
            'Supports $ off per foot',
            'Supports % off specific item',
            'Supports fixed rebate',
            'Applies at brand, model, or component level',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.9', points: 3, epicId: 'promotions',
    },
    {
        title: '4.1.2 — Promotion Alerts',
        description: story('salesperson', 'to be alerted to active promotions', "I don't miss opportunities"),
        acceptanceCriteria: [
            'Alerts shown when applicable',
            'Promotions are date-bounded',
            'Promotions are NOT auto-applied (manual for MVP)',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.9', points: 3, epicId: 'promotions',
    },
];

const EPIC_5_FEATURES: SeedFeature[] = [
    {
        title: '5.1.1 — Flexible Quoting Units (hull-only, engine-only, trailer-only)',
        description: story('salesperson', 'to quote individual components', 'HelmLogic works beyond full boat sales'),
        acceptanceCriteria: [
            'Can quote hull-only',
            'Can quote engine-only',
            'Can quote trailer-only',
            'Configuration rules are modular, not hard-wired to "boat = required"',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v2.0', points: 5, epicId: 'security-extensibility',
    },
    {
        title: '5.2.1 — Brand & Dealer Isolation (RBAC + leakage tests)',
        description: story('platform owner', 'strict access controls', 'commercial data is protected'),
        acceptanceCriteria: [
            'Users see only authorised brands (e.g. Marine Trade Supplies sees Highfield only)',
            'Sub-dealers cannot see other dealers\' quotes / opportunities',
            'Pricing visibility is role-controlled',
            'Crowdsourcing permissions are restricted',
            'Leakage tests covering cross-brand AND cross-dealer scenarios',
        ],
        type: 'feature', priority: 'critical', targetRelease: 'v2.0', points: 8, epicId: 'security-extensibility',
    },
    {
        title: '5.3.1 — Brand Onboarding Without Code',
        description: story('product owner', 'to add brands without deployment changes', 'HelmLogic can scale safely'),
        acceptanceCriteria: [
            'Brand onboarding is data-driven',
            'Quoting logic remains isolated per brand',
            'Documented playbook for onboarding a new brand end-to-end',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v2.0', points: 3, epicId: 'security-extensibility',
    },
];

/** All 22 features from the MVP spec, bucketed into v1.7 → v2.0. */
const ALL_FEATURES: SeedFeature[] = [
    ...EPIC_1_FEATURES,
    ...EPIC_2_FEATURES,
    ...EPIC_3_FEATURES,
    ...EPIC_4_FEATURES,
    ...EPIC_5_FEATURES,
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seedEpics(token: string): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;
    for (const epic of EPICS) {
        const existing = await fsGet(token, `epics/${epic.id}`);
        if (existing) {
            console.log(`  · epic SKIP    ${epic.id} (already exists)`);
            skipped++;
            continue;
        }
        if (LIVE) {
            await fsCreate(token, 'epics', epic.id, {
                title: epic.title,
                shortLabel: epic.shortLabel,
                description: epic.description,
                color: epic.color,
                order: epic.order,
                status: epic.status,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
        console.log(`  + epic CREATE  ${epic.id}  "${epic.title}"`);
        created++;
    }
    return { created, skipped };
}

async function seedFeatures(token: string): Promise<{ created: number; skipped: number }> {
    // Build a set of existing feature titles so we can skip them.
    const existingDocs = await fsList(token, 'features');
    const existingTitles = new Set<string>();
    for (const d of existingDocs) {
        const t = readStr(d, 'title');
        if (t) existingTitles.add(t.trim());
    }

    let created = 0;
    let skipped = 0;
    for (const f of ALL_FEATURES) {
        if (existingTitles.has(f.title.trim())) {
            console.log(`  · feature SKIP   "${f.title}" (already exists)`);
            skipped++;
            continue;
        }
        if (LIVE) {
            await fsAdd(token, 'features', {
                title: f.title,
                description: f.description,
                acceptanceCriteria: f.acceptanceCriteria,
                type: f.type,
                status: 'submitted',
                priority: f.priority,
                targetRelease: f.targetRelease,
                points: f.points,
                epicId: f.epicId,
                tags: [],
                voteIds: [],
                imageUrls: [],
                commentCount: 0,
                deletedAt: null,
                deletedBy: null,
                order: 0,
                submitterId: 'seed-mvp-plan',
                submitterName: 'MVP Seed Script',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
        console.log(`  + feature CREATE "${f.title}"  [${f.epicId}, ${f.targetRelease}, ${f.points}pts]`);
        created++;
    }
    return { created, skipped };
}

async function main() {
    console.log(`\n=== Seed v1.6 MVP plan ${LIVE ? '(LIVE)' : '(dry-run)'} ===\n`);
    if (!LIVE) {
        console.log('Dry-run — re-run with --live to actually write to Firestore.\n');
    }

    const token = await getAnonymousToken();

    console.log(`Seeding ${EPICS.length} epics:`);
    const epicResult = await seedEpics(token);

    console.log(`\nSeeding ${ALL_FEATURES.length} features:`);
    const featResult = await seedFeatures(token);

    console.log(`\n=== Summary ===`);
    console.log(`Epics:    ${epicResult.created} created, ${epicResult.skipped} skipped`);
    console.log(`Features: ${featResult.created} created, ${featResult.skipped} skipped`);
    console.log(`Mode:     ${LIVE ? 'LIVE writes' : 'dry-run only'}\n`);
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
