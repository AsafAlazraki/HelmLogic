/**
 * Sample-quote fixture for the 1.8.7 live PDF preview.
 *
 * The Document Templates editor's PDF preview pane renders the
 * full customer-facing ProposalPDFDocument so the author sees how
 * their content blocks land inside a real proposal — not a stripped-
 * down preview. To do that without requiring an actual quote in
 * Firestore, we synthesize a realistic-looking quote payload here.
 *
 * Boat: Highfield CL340 Classic with Yamaha F150 + Stratos trailer.
 * Customer: a generic ABC Fishing Charters lead.
 * Pricing: representative of NSM's typical configuration.
 *
 * The fixture is consumed by content-blocks-pdf-preview.tsx and
 * passed straight into ProposalPDFDocument alongside the org's
 * content blocks (so the author can verify content rendering in
 * real layout context).
 *
 * Caveat: only `terms-and-conditions` from content blocks renders
 * in the real PDF as of v1.7 (1.2.1 first cut). The other 6
 * sections (salesperson-message, why-us, brand-story, after-sales,
 * finance-info, value-summary) render once 1.2.1 lands fully in
 * v1.8 — the preview will pick them up automatically when the PDF
 * starts rendering them.
 */

import type { ContentBlock } from '@/lib/content-blocks';

export interface SampleQuoteFixture {
    quote: any;
    organisation: any;
    financials: any;
}

const NOW = new Date();
const VALID_UNTIL = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);

/** Build a fresh fixture each call — keeps quoteNumber + dates current. */
export function buildSampleQuoteFixture(opts: {
    organisationName?: string;
    primaryLogoUrl?: string | null;
    secondaryLogoUrl?: string | null;
    /** When provided, overrides the fixture's vendorId so brand-overrides
     *  are exercised in preview. */
    vendorId?: string | null;
}): SampleQuoteFixture {
    const orgName = opts.organisationName || 'Your Organisation';
    const previewQuoteNumber = `PREVIEW-${NOW.getFullYear()}${String(NOW.getMonth() + 1).padStart(2, '0')}-001`;

    const variant = {
        id: 'preview-variant-cl340-grey-hyp',
        name: 'Standard',
        sku: 'CL340-GREY-HYP',
        colorName: 'Grey',
        colorCode: '#5b6770',
        material: 'Hypalon',
        cost: 38000,
        sellPriceExclGst: 56000,
        imageUrl: null,
    };

    const selectedOptions = [
        { id: 'opt-bow-locker',  name: 'Bow Locker (Insulated)',          category: 'Storage',     sellPriceExclGst: 1850, imageUrl: null },
        { id: 'opt-tube-cover',  name: 'Tube Cover (Sunbrella Charcoal)', category: 'Protection',  sellPriceExclGst: 1650, imageUrl: null },
        { id: 'opt-bait-tank',   name: 'Live Bait Tank — 50L',            category: 'Fishing',     sellPriceExclGst: 1295, imageUrl: null },
        { id: 'opt-rocket-launcher', name: 'Rocket Launcher (4-rod)',     category: 'Fishing',     sellPriceExclGst: 850,  imageUrl: null },
        { id: 'opt-sounder-mount',   name: 'Garmin Sounder Mount Plate',  category: 'Electronics', sellPriceExclGst: 320,  imageUrl: null },
    ];

    const motor = {
        id: 'motor-yamaha-f150',
        name: 'Yamaha F150 — 4-Stroke',
        brand: 'Yamaha',
        brandLogoUrl: null,
        sellPriceExclGst: 24500,
        cost: 17500,
        accessoryItems: [
            { name: 'Yamaha 6Y8 CommandLink Plus Gauges', sellPriceExclGst: 1450 },
            { name: 'Stainless Steel Prop (3-blade, 14.25)', sellPriceExclGst: 850 },
        ],
    };

    const trailer = {
        id: 'trailer-stratos-200',
        name: 'Stratos 200 Series — Aluminium Tandem',
        brand: 'Stratos',
        sellPriceExclGst: 8950,
        cost: 6300,
        options: [
            { name: 'Spare Wheel + Carrier', sellPriceExclGst: 320 },
        ],
    };

    const dealerFit = [
        { id: 'df-prep',    name: 'Pre-Delivery Inspection & Hand-Over',      sellPriceExclGst: 850, cost: 350 },
        { id: 'df-detail',  name: 'Premium Detail + Anti-Fouling',           sellPriceExclGst: 480, cost: 180 },
        { id: 'df-rego-help', name: 'Boat Registration Service',              sellPriceExclGst: 220, cost: 50  },
    ];

    const boatBasePrice = variant.sellPriceExclGst;
    const optionsTotal = selectedOptions.reduce((s, o) => s + o.sellPriceExclGst, 0);
    const motorTotal = motor.sellPriceExclGst + motor.accessoryItems.reduce((s, a) => s + a.sellPriceExclGst, 0);
    const trailerTotal = trailer.sellPriceExclGst + trailer.options.reduce((s, o) => s + o.sellPriceExclGst, 0);
    const dealerFitTotal = dealerFit.reduce((s, d) => s + d.sellPriceExclGst, 0);
    const regoTotal = 850;
    const subtotalExclGst = boatBasePrice + optionsTotal + regoTotal + motorTotal + trailerTotal + dealerFitTotal;
    const totalInclGst = Math.ceil(subtotalExclGst * 1.1);
    const gstAmount = totalInclGst - subtotalExclGst;

    const boatCost = variant.cost;
    const optionsCost = optionsTotal * 0.65;
    const motorCost = motor.cost + motor.accessoryItems.reduce((s, a) => s + a.sellPriceExclGst * 0.65, 0);
    const trailerCost = trailer.cost + trailer.options.reduce((s, o) => s + o.sellPriceExclGst * 0.65, 0);
    const dealerFitCost = dealerFit.reduce((s, d) => s + d.cost, 0);
    const totalDealCostExclGst = boatCost + optionsCost + motorCost + trailerCost + dealerFitCost + regoTotal;

    return {
        quote: {
            quoteNumber: previewQuoteNumber,
            status: 'proposal',
            createdAt: { toDate: () => NOW },
            createdByUid: 'preview-user',
            createdByName: 'Sample Salesperson',
            organisationId: null,
            customer: {
                name: 'John Smith',
                email: 'john@example.com',
                phone: '0400 000 000',
                company: 'ABC Fishing Charters',
                address: '12 Coastal Road, Sample Bay NSW',
            },
            moduleId: 'preview-module',
            moduleName: 'Highfield Boats',
            moduleSlug: 'highfield',
            vendorId: opts.vendorId ?? 'highfield',
            vendorName: 'Highfield',
            vendorLogoUrl: null,
            vendorCurrency: 'USD',
            rangeId: 'classic',
            rangeName: 'Classic',
            rangeImageUrl: null,
            modelId: 'cl340',
            modelName: 'CL340',
            modelCode: 'CL340',
            coverImageUrl: null,
            specifications: {
                otherSpecs: [
                    { label: 'Length',      value: '3.40 m' },
                    { label: 'Beam',        value: '1.78 m' },
                    { label: 'Dry Weight',  value: '85 kg' },
                    { label: 'Max HP',      value: '25 HP' },
                    { label: 'Max Persons', value: '5' },
                    { label: 'Tube Diameter', value: '0.46 m' },
                    { label: 'Air Chambers', value: '5' },
                ],
                motorConfigurations: [{ engines: [{ minHp: 15, maxHp: 25 }] }],
            },
            standardFeatures: [
                'Hypalon tubes (1.2 mm)',
                'Aluminium hull',
                'Bow eye + stern eye',
                'Tow rings (4)',
                'Lifting handles',
                'Foot pump + repair kit',
                'Wooden floorboards',
                'Side carry handles',
            ],
            variant,
            selectedOptions,
            customOptions: [],
            registration: {
                boatRego: true,
                trailerRego: false,
                stickerOnly: false,
                tenderTo: false,
            },
            motor,
            trailer,
            dealerFit,
            priceLevelUsed: 'hull_cash',
            promotions: { applied: [], discountTotal: 0 },
            adminDetails: {},
        },
        organisation: {
            name: orgName,
            shortCode: orgName.slice(0, 3).toUpperCase(),
            primaryLogoUrl: opts.primaryLogoUrl || null,
            secondaryLogoUrl: opts.secondaryLogoUrl || null,
            // termsAndConditions intentionally absent — the preview should
            // exercise the content-blocks T&Cs path (with fallback to
            // DEFAULT_TERMS when no block exists yet).
        },
        financials: {
            boatBasePrice,
            optionsTotal,
            regoTotal,
            motorTotal,
            trailerTotal,
            dealerFitTotal,
            subtotalExclGst,
            finalTotalPriceExclGst: subtotalExclGst,
            gstAmount,
            totalInclGst,
            boatCost,
            optionsCost,
            motorCost,
            trailerCost,
            dealerFitCost,
            totalDealCostExclGst,
            margin: subtotalExclGst - totalDealCostExclGst,
            marginPercent: ((subtotalExclGst - totalDealCostExclGst) / subtotalExclGst) * 100,
            validUntil: VALID_UNTIL,
        },
    };
}

/** Convert content-block docs (full collection) into the resolved
 *  contentBlocks map ProposalPDFDocument expects, scoped to the
 *  given documentType + brand override. Mirrors the live
 *  resolveContentBlocksForQuote() but works off in-memory data
 *  (no Firestore round-trip in the live preview path). */
export function resolveContentBlocksForPreview(
    blocks: ContentBlock[] | null,
    documentType: 'quote' | 'contract',
    vendorId: string | null,
    brandOverrides: Map<string, string>,
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const b of blocks ?? []) {
        if (!b.blockType) continue;
        const docTypes = b.documentTypes && b.documentTypes.length > 0 ? b.documentTypes : ['quote'];
        if (!docTypes.includes(documentType)) continue;

        let html = b.html ?? '';
        if (vendorId) {
            const overrideKey = `${b.id}::${vendorId}`;
            const override = brandOverrides.get(overrideKey);
            if (override) html = override;
        }
        if (html.trim()) {
            result[b.blockType] = html;
        }
    }
    return result;
}
