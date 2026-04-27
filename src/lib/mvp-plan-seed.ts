/**
 * In-app v1.6 MVP plan seeder.
 *
 * Used by the "Seed MVP plan" button inside Manage Epics. Creates the
 * 5 Epics (with stable slug ids) and the 22 user-story Features from
 * `tasks/v1.6-planning-system-design.md` §6, idempotently.
 *
 * Why an in-app button instead of a CLI script: HelmLogic ships via
 * Firebase App Hosting, no local dev env. Clicking from the deployed
 * app runs against the same Firestore the team is using.
 *
 * Auth: any signed-in non-sub-dealer user can run this — Firestore
 * rules already gate features+epics writes by isSubDealer(). The
 * button is in Manage Epics which is itself only reachable to non-
 * sub-dealers.
 */

import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    type Firestore,
} from 'firebase/firestore';
import type { EpicColor, FeaturePriority, FeatureType } from '@/components/feature-tracking-board';

interface SeedEpic {
    /** Stable slug used as the doc id — features reference it via epicId. */
    id: string;
    title: string;
    shortLabel: string;
    description: string;
    color: EpicColor;
    order: number;
    status: 'planning' | 'active' | 'done';
}

interface SeedFeature {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    type: FeatureType;
    priority: FeaturePriority;
    targetRelease: string | null;
    points: number | null;
    epicId: string;
}

const story = (role: string, want: string, so: string) =>
    `<p><strong>As a</strong> ${role}<br><strong>I want</strong> ${want}<br><strong>So that</strong> ${so}.</p>`;

const EPICS: SeedEpic[] = [
    { id: 'guided-configuration',   title: 'Guided Configuration & Quote Creation',     shortLabel: 'Guided Config', description: 'Validated configuration flow + branded customer-ready proposal output. The MVP cornerstone — emotional + technically accurate.',                                              color: 'blue',    order: 100, status: 'active'   },
    { id: 'pricing-accuracy',       title: 'Pricing Accuracy & Margin Protection',      shortLabel: 'Pricing',       description: 'All quote line pricing sourced from approved lists with audit trail; margin enforcement with GM override; post-contract variations.',                                          color: 'amber',   order: 200, status: 'planning' },
    { id: 'data-management',        title: 'Data Management & Sustainability',          shortLabel: 'Data',          description: 'Structured imports with versioning + manual approval; consistent internal data model; controlled crowdsourced suggestions with audit.',                                       color: 'violet',  order: 300, status: 'planning' },
    { id: 'promotions',             title: 'Promotions & Commercial Flexibility',       shortLabel: 'Promotions',    description: 'Manual promo entry across $/HP, $/foot, %, and fixed rebate forms; alerts when a quote includes an item with active promo.',                                                  color: 'emerald', order: 400, status: 'planning' },
    { id: 'security-extensibility', title: 'Security, Extensibility & Dealer Model',    shortLabel: 'Security',      description: 'Hull-only / engine-only / trailer-only quoting; brand & dealer isolation (no cross-brand or cross-dealer leakage); brand onboarding without code changes.',                  color: 'rose',    order: 500, status: 'planning' },
];

const FEATURES: SeedFeature[] = [
    // Epic 1 — Guided Configuration (9 stories, 35 pts → v1.7)
    { title: '1.1.1 — Enforced Configuration Sequence',                       description: story('salesperson', 'to be guided through a fixed configuration sequence', 'I cannot accidentally build an invalid boat package'),                            acceptanceCriteria: ['Order: Hull → Manufacturer options → Engine(s) & rigging → Trailer → Dealer fit options & accessories → Dealer fit-out charge', 'Steps cannot be skipped', 'System always maintains a valid state'], type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 2, epicId: 'guided-configuration' },
    { title: '1.1.2 — Compatibility Rule Enforcement',                        description: story('salesperson', 'the system to prevent incompatible combinations', 'I never quote an unbuildable package'),                                              acceptanceCriteria: ['Hard rules between Hull ↔ Engine, Hull ↔ Trailer, Hull ↔ Manufacturer options', 'Invalid combinations cannot be saved', 'Invalid combinations cannot be quoted', 'User sees a clear validation error'], type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration' },
    { title: '1.1.3 — Multiple Quote Scenarios',                              description: story('salesperson', 'to create multiple quote versions for one customer', 'I can easily present alternatives'),                                              acceptanceCriteria: ['Quote can be duplicated into new versions', 'Versions are clearly labelled (e.g. Option A / Option B)', 'Only one version can be marked Finalised'], type: 'feature', priority: 'medium',   targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration' },
    { title: '1.2.1 — Branded PDF Quote Generation',                          description: story('salesperson', 'the system to generate a professional customer-ready quote', 'I can present the boat as a premium ownership experience'),               acceptanceCriteria: ['Personalised salesperson message', 'Why Northside Marine + Life Beyond the Shore positioning', 'End-to-end ownership support', 'Brand & model story', 'Configured boat summary (visual, not SKU tables)', 'After-sales confidence & warranties', 'Finance & insurance (informational)', 'Value summary', 'No system IDs or SKU codes are visible'], type: 'feature', priority: 'critical', targetRelease: 'v1.7', points: 8, epicId: 'guided-configuration' },
    { title: '1.2.2 — Brand-Aware Content Injection',                         description: story('salesperson', 'brand-specific content to auto-populate', 'the quote is accurate and on-brand every time'),                                             acceptanceCriteria: ['Correct logos, imagery, and copy load per brand', 'No cross-brand content leakage'], type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration' },
    { title: '1.2.3 — Controlled Personalisation',                            description: story('salesperson', 'to personalise parts of the quote safely', 'the document remains professional and consistent'),                                         acceptanceCriteria: ['Only approved text sections are editable', 'Document structure cannot be broken'], type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration' },
    { title: '1.3.1 — Finalised Quote Locking',                               description: story('sales manager', 'finalised quotes to be locked', 'commercial integrity is preserved'),                                                                  acceptanceCriteria: ['Finalised quotes are read-only', 'Changes require a variation workflow'], type: 'feature', priority: 'medium',   targetRelease: 'v1.7', points: 1, epicId: 'guided-configuration' },
    { title: '1.3.2 — Contract Signing Pack Generation',                      description: story('salesperson', 'a complete signing pack generated automatically', 'the customer can sign without manual assembly'),                                     acceptanceCriteria: ['Pack includes: Final quote, Payment plan expectations, T&Cs, Configuration summary'], type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration' },
    { title: '1.3.3 — SharePoint Quote Storage',                              description: story('staff member', 'finalised quotes stored in SharePoint', 'customers can be supported when the salesperson is unavailable'),                              acceptanceCriteria: ['PDF is automatically written to SharePoint', 'Location is configurable', 'Access controlled by permissions', 'Requires Azure AD app registration + Files.ReadWrite.All on the target site'], type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration' },

    // Epic 1 expansion — Quote Lifecycle (1.4.x), Customer 360 / CRM (1.5.x), Comms (1.6.x), Operational dashboards (1.7.x)
    { title: '1.4.1 — Quote Lifecycle States',                                description: story('salesperson', 'quotes to progress through real states (Draft → Sent → Viewed → Accepted / Rejected / Lost / Expired)', 'I can see exactly where each customer is in the buying journey'),       acceptanceCriteria: ['Status enum extended beyond draft/finalised', 'State transitions logged with timestamp + actor', 'Visual state badge on quote card + detail sheet', 'Won / Lost reason capture'],                                                                                            type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration' },
    { title: '1.4.2 — Send Quote Action',                                     description: story('salesperson', 'a single action that sends a quote to the customer and records when it went out', 'I never lose track of which quotes are in front of which customers'),                            acceptanceCriteria: ['"Send" button on a draft quote', 'Email send when SMTP integration is live; otherwise a manual "mark sent" with note', 'Send timestamp + recipient stored on the quote', 'State auto-transitions to "Sent"'],                                                                  type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration' },
    { title: '1.4.3 — Acceptance Capture',                                    description: story('sales manager', 'to record customer acceptance of a quote (sales-rep marks for now, e-sig later)', 'we have a defensible record that the customer agreed to the price'),                          acceptanceCriteria: ['"Mark accepted" action on a sent quote', 'Acceptance timestamp + actor stored', 'State transitions to "Accepted"', 'Can attach a customer email/PDF screenshot as evidence', 'E-sig deferred to a future release'],                                                            type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration' },
    { title: '1.4.4 — Quote Validity / Expiry',                               description: story('salesperson', 'quotes to have an expiry date that auto-rolls them to "Expired" if not accepted in time', 'pricing snapshots stay commercially safe'),                                          acceptanceCriteria: ['Configurable validity period per brand (default 30 days)', 'Expiry date shown on the proposal PDF', 'Auto-transition to "Expired" past the date (cron or on-load)', 'Sales rep can manually extend with a reason'],                                                            type: 'feature', priority: 'medium',   targetRelease: 'v1.8', points: 2, epicId: 'guided-configuration' },
    { title: '1.4.5 — Quote Versioning per Customer',                         description: story('salesperson', 'multiple quote versions for one customer linked together as Option A / B / C', 'the customer can compare alternatives and I can see them all in one place'),                       acceptanceCriteria: ['"Duplicate as new version" action on a quote', 'Sibling versions linked under the same customer', 'Customer detail sheet shows all versions of a single opportunity', 'Only one version can be Accepted'],                                                                  type: 'feature', priority: 'medium',   targetRelease: 'v1.8', points: 5, epicId: 'guided-configuration' },
    { title: '1.5.1 — Customer Detail Sheet',                                 description: story('salesperson', 'a single page that shows everything about a customer: their details, every quote, every contract, every note', 'I never have to switch tools to remember a relationship'), acceptanceCriteria: ['Customer 360 view: profile + quotes + contracts + comms + notes timeline', 'Click-through to any artifact', 'Inline edit of customer fields'],                                                                                                                                  type: 'feature', priority: 'high',     targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration' },
    { title: '1.5.2 — Customer Pipeline View',                                description: story('sales manager', 'a Kanban view of all customers grouped by lifecycle stage (lead → qualified → quoted → contracted → delivered)', 'I see at a glance where the team is and where things are stuck'), acceptanceCriteria: ['Kanban board: lead / active opp / quoted / contracted / delivered / lost', 'Drag a customer between stages', 'Filter by salesperson, brand, value', 'Stage colour-coded'],                                                                                                  type: 'feature', priority: 'medium',   targetRelease: 'v1.8', points: 8, epicId: 'guided-configuration' },
    { title: '1.5.3 — Customer Notes Timeline',                               description: story('salesperson', 'to capture notes against a customer with a timestamp and author', 'context survives staff handovers'),                                                                                  acceptanceCriteria: ['Free-text note input on customer detail sheet', 'Timeline of all notes (and other interactions, see 1.6.1) sorted DESC', 'Author + timestamp captured automatically', 'Notes visible to anyone with access to the customer'],                                                  type: 'feature', priority: 'medium',   targetRelease: 'v1.8', points: 3, epicId: 'guided-configuration' },
    { title: '1.5.4 — Customer Source Tracking',                              description: story('sales manager', 'to know how each customer found us (boat show, referral, web, walk-in)', 'we can measure marketing ROI'),                                                                          acceptanceCriteria: ['Source field on customer doc (enum + free-text override)', 'Source picker shown on first customer create', 'Source visible on customer detail sheet', 'Reports can group by source (post-MVP)'],                                                                                type: 'feature', priority: 'low',      targetRelease: 'v1.8', points: 2, epicId: 'guided-configuration' },
    { title: '1.5.5 — Trade-In Record',                                       description: story('salesperson', 'to capture the customer\'s trade-in vessel (make / model / year / condition / agreed value)', 'the trade-in flows through to the quote and the deposit calculation'),                acceptanceCriteria: ['Trade-in fields linked to customer + quote', 'Agreed trade-in value applied as a credit on the quote', 'Trade-in inspection notes + photos', 'Trade-in stays with the customer record after the deal'],                                                                          type: 'feature', priority: 'medium',   targetRelease: 'v1.9', points: 3, epicId: 'guided-configuration' },
    { title: '1.5.6 — Spouse / Co-buyer Support',                             description: story('salesperson', 'to record a customer with a partner or co-buyer who also signs the contract', 'shared-ownership purchases are handled cleanly'),                                                       acceptanceCriteria: ['Customer doc supports a primary + secondary buyer', 'Both names appear on quote/contract artifacts', 'Either party can be the comms point of contact'],                                                                                                                       type: 'feature', priority: 'low',      targetRelease: 'v1.9', points: 3, epicId: 'guided-configuration' },
    { title: '1.5.7 — Customer Document Storage',                             description: story('salesperson', 'to attach customer documents (driver\'s license, finance approval letters, ID) to the customer record', 'I have everything I need to close the deal in one place'),                  acceptanceCriteria: ['Document upload on customer detail sheet (PDF / image)', 'Document list with preview + download', 'Per-document description', 'Documents survive deletion of any single quote/contract'],                                                                                       type: 'feature', priority: 'low',      targetRelease: 'v1.9', points: 5, epicId: 'guided-configuration' },
    { title: '1.6.1 — Comms Log (unified interaction timeline)',              description: story('salesperson', 'every interaction with a customer (email sent, call made, note added, status changed) to land in one timeline per customer', 'I never have to reconstruct a relationship'),            acceptanceCriteria: ['Timeline merges notes (1.5.3), state transitions, sent quotes (1.4.2), emails when SMTP works', 'Each entry: type icon + timestamp + actor + body', 'Filter by interaction type', 'Inline note creation from the timeline'],                                                  type: 'feature', priority: 'medium',   targetRelease: 'v1.8', points: 5, epicId: 'guided-configuration' },
    { title: '1.7.1 — Sales Pipeline Dashboard',                              description: story('sales manager', 'a dashboard showing total in-flight pipeline value, conversion rate, weighted forecast', 'I can run the team without spreadsheets'),                                                acceptanceCriteria: ['Total pipeline value (sum of weighted active quotes/contracts)', 'Conversion rate per stage', 'Per-salesperson breakdown', 'Per-brand breakdown', 'Filter by date range'],                                                                                                       type: 'feature', priority: 'medium',   targetRelease: 'v1.9', points: 8, epicId: 'guided-configuration' },
    { title: '1.7.2 — My Quotes / My Customers / My Contracts views',         description: story('salesperson', 'salesperson-scoped views so I see only my work without filtering manually', 'my workspace is mine'),                                                                                    acceptanceCriteria: ['"My Quotes" view filters to current user', 'Same for customers and contracts', 'Toggle to "All" for sales managers', 'Default landing for non-managers is "My X"'],                                                                                                            type: 'feature', priority: 'high',     targetRelease: 'v1.9', points: 3, epicId: 'guided-configuration' },
    { title: '1.7.3 — Recent Activity Feed',                                  description: story('sales manager', 'a chronological feed of every important event across customers/quotes/contracts', 'I have ambient awareness of what the team is doing'),                                            acceptanceCriteria: ['Cross-customer activity stream', 'Filter by event type / salesperson', 'Click an entry to jump to the source artifact', 'Configurable retention (e.g. last 30 days)'],                                                                                                         type: 'feature', priority: 'medium',   targetRelease: 'v1.9', points: 2, epicId: 'guided-configuration' },
    { title: '1.7.4 — Global Search',                                         description: story('salesperson', 'to search across customers / quotes / contracts / features from one place', 'I never lose 10 minutes hunting for a record'),                                                          acceptanceCriteria: ['Top-of-page search box', 'Searches title / customer name / quote number / contract number', 'Grouped result list', 'Keyboard shortcut (Cmd+K) opens it'],                                                                                                                       type: 'feature', priority: 'medium',   targetRelease: 'v1.9', points: 3, epicId: 'guided-configuration' },

    // Epic 2 — Pricing Accuracy (5 stories, 23 pts → v1.8 + v1.9)
    { title: '2.1.1 — Structured Price Sources',                              description: story('finance stakeholder', 'all prices sourced from approved lists', 'pricing is accurate and auditable'),                                                  acceptanceCriteria: ['Prices originate from: Vendor/distributor price lists, Internal fit-out tables', 'Each line shows source reference & last updated date'], type: 'feature', priority: 'medium',   targetRelease: 'v1.8', points: 2, epicId: 'pricing-accuracy' },
    { title: '2.1.2 — Model-Specific Fit-Out Pricing (Basic / Moderate / Complex)', description: story('salesperson', 'model-specific fit-out tiers', 'labour pricing matches reality'),                                                                acceptanceCriteria: ['Each model supports Basic / Moderate / Complex tiers', 'Pricing examples from spec: Stabicraft 2350 = $2,800 / $5,500 / $7,800; Surtees GF770 has different numbers for similar size'], type: 'feature', priority: 'high',     targetRelease: 'v1.8', points: 5, epicId: 'pricing-accuracy' },
    { title: '2.2.1 — Margin Threshold Enforcement + GM Override',            description: story('sales manager', 'low-margin quotes blocked by default', 'we protect profitability'),                                                                   acceptanceCriteria: ['Quotes below threshold cannot be sent', 'GM Sales & Marketing can override', 'Overrides are fully auditable'], type: 'feature', priority: 'high',     targetRelease: 'v1.8', points: 5, epicId: 'pricing-accuracy' },
    { title: '2.2.2 — Role-Based Margin Visibility',                          description: story('salesperson', 'simple margin signals', 'I know when a deal is healthy'),                                                                              acceptanceCriteria: ['Sales see Target margin %', 'Sales see Margin band (Green / Amber / Red)', 'Cost detail hidden where appropriate (e.g. internal fit-out items)'], type: 'feature', priority: 'medium',   targetRelease: 'v1.8', points: 3, epicId: 'pricing-accuracy' },
    { title: '2.3.1 — Quote Variations (post-contract)',                      description: story('salesperson', 'to make controlled changes after signing', 'customer changes are handled professionally'),                                              acceptanceCriteria: ['Items can be added or removed', 'Price delta clearly shown', 'Deal totals and margin recalculated', 'Original contract remains unchanged (locked baseline)'], type: 'feature', priority: 'high',     targetRelease: 'v1.9', points: 8, epicId: 'pricing-accuracy' },

    // Epic 3 — Data Management (3 stories, 13 pts → v1.9)
    { title: '3.1.1 — Structured Data Imports + Versioning + Manual Approval', description: story('administrator', 'to import structured data', 'HelmLogic stays up to date efficiently'),                                                              acceptanceCriteria: ['Supports import of pricing, specs, photos, marketing copy', 'Versioning applied', 'Manual approval before publish'], type: 'feature', priority: 'medium',   targetRelease: 'v1.9', points: 5, epicId: 'data-management' },
    { title: '3.2.1 — Internal Data Normalisation Layer',                     description: story('product owner', 'consistent internal data structures', 'quoting logic remains stable'),                                                                acceptanceCriteria: ['All imported data is normalised', 'NSM-specific overlays supported (descriptions, talking points, brand narrative)'], type: 'feature', priority: 'low',      targetRelease: 'v1.9', points: 3, epicId: 'data-management' },
    { title: '3.3.1 — Crowdsourced Suggestions with Audit',                   description: story('user', 'to flag errors or suggest improvements', 'data accuracy improves over time'),                                                                  acceptanceCriteria: ['Suggestions require review & publish by an authorised role', 'Full edit history retained', 'Sub-dealer permissions enforced (must not leak across brands/dealers)'], type: 'feature', priority: 'medium',   targetRelease: 'v1.9', points: 5, epicId: 'data-management' },

    // Epic 4 — Promotions (2 stories, 6 pts → v1.9)
    { title: '4.1.1 — Promotion Entry (manual, all forms)',                   description: story('salesperson', 'to manually enter promotions', 'real-world deals can be quoted'),                                                                       acceptanceCriteria: ['Supports $ off per HP', 'Supports $ off per foot', 'Supports % off specific item', 'Supports fixed rebate', 'Applies at brand, model, or component level'], type: 'feature', priority: 'high',     targetRelease: 'v1.9', points: 3, epicId: 'promotions' },
    { title: '4.1.2 — Promotion Alerts',                                      description: story('salesperson', 'to be alerted to active promotions', "I don't miss opportunities"),                                                                     acceptanceCriteria: ['Alerts shown when applicable', 'Promotions are date-bounded', 'Promotions are NOT auto-applied (manual for MVP)'], type: 'feature', priority: 'medium',   targetRelease: 'v1.9', points: 3, epicId: 'promotions' },

    // Epic 5 — Security & Extensibility (3 stories, 16 pts → v2.0)
    { title: '5.1.1 — Flexible Quoting Units (hull-only, engine-only, trailer-only)', description: story('salesperson', 'to quote individual components', 'HelmLogic works beyond full boat sales'),                                                    acceptanceCriteria: ['Can quote hull-only', 'Can quote engine-only', 'Can quote trailer-only', 'Configuration rules are modular, not hard-wired to "boat = required"'], type: 'feature', priority: 'high',     targetRelease: 'v2.0', points: 5, epicId: 'security-extensibility' },
    { title: '5.2.1 — Brand & Dealer Isolation (RBAC + leakage tests)',       description: story('platform owner', 'strict access controls', 'commercial data is protected'),                                                                            acceptanceCriteria: ['Users see only authorised brands (e.g. Marine Trade Supplies sees Highfield only)', "Sub-dealers cannot see other dealers' quotes / opportunities", 'Pricing visibility is role-controlled', 'Crowdsourcing permissions are restricted', 'Leakage tests covering cross-brand AND cross-dealer scenarios'], type: 'feature', priority: 'critical', targetRelease: 'v2.0', points: 8, epicId: 'security-extensibility' },
    { title: '5.3.1 — Brand Onboarding Without Code',                         description: story('product owner', 'to add brands without deployment changes', 'HelmLogic can scale safely'),                                                              acceptanceCriteria: ['Brand onboarding is data-driven', 'Quoting logic remains isolated per brand', 'Documented playbook for onboarding a new brand end-to-end'], type: 'feature', priority: 'medium',   targetRelease: 'v2.0', points: 3, epicId: 'security-extensibility' },
];

export interface SeedSummary {
    epicsCreated: number;
    epicsSkipped: number;
    featuresCreated: number;
    featuresSkipped: number;
}

/**
 * Run the seeder. Idempotent — re-running after a successful seed
 * results in 0 created / 27 skipped.
 */
export async function seedMvpPlan(
    firestore: Firestore,
    submitterUid: string | undefined,
    submitterName: string,
): Promise<SeedSummary> {
    let epicsCreated = 0;
    let epicsSkipped = 0;
    let featuresCreated = 0;
    let featuresSkipped = 0;

    // Epics: stable slug ids, getDoc → create-if-missing.
    for (const epic of EPICS) {
        const ref = doc(firestore, 'epics', epic.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            epicsSkipped++;
            continue;
        }
        await setDoc(ref, {
            title: epic.title,
            shortLabel: epic.shortLabel,
            description: epic.description,
            color: epic.color,
            order: epic.order,
            status: epic.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        epicsCreated++;
    }

    // Features: list once, dedupe by title (the spec's "1.1.1 — ..."
    // numbering means collisions are effectively impossible).
    const existing = await getDocs(collection(firestore, 'features'));
    const existingTitles = new Set<string>();
    existing.forEach(d => {
        const t = (d.data().title as string | undefined)?.trim();
        if (t) existingTitles.add(t);
    });

    for (const f of FEATURES) {
        if (existingTitles.has(f.title.trim())) {
            featuresSkipped++;
            continue;
        }
        await addDoc(collection(firestore, 'features'), {
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
            submitterId: submitterUid ?? 'seed-mvp-plan',
            submitterName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        featuresCreated++;
    }

    return { epicsCreated, epicsSkipped, featuresCreated, featuresSkipped };
}
