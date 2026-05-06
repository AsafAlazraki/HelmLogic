/**
 * Sample-quote fixture for the 1.8.7 live PDF preview.
 *
 * v1.7 (post-1.8.10 revert): goes back to a hardcoded fixture.
 * 1.8.10 tried to fetch a real model from the org's catalog but
 * Asaf's first-model-with-coverImageUrl turned out to be test/
 * garbage data ("tet"). Hardcoded is what was actually wanted —
 * a fully spec'd Highfield Sport 560 with lots of options so the
 * preview shows what a loaded customer quote looks like.
 *
 * Highfield Sport 560 reference:
 *   - 5.60 m × 2.30 m, dry weight 410 kg
 *   - Hypalon, max 100 HP, max 9 persons
 *   - Real-world spec sheet from the Highfield catalog.
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
        id: 'preview-variant-sport560-grey-hyp',
        name: 'Standard',
        sku: 'SP560-GREY-HYP',
        colorName: 'Storm Grey',
        colorCode: '#475569',
        material: 'Hypalon',
        cost: 89000,
        sellPriceExclGst: 124500,
        imageUrl: null,
    };

    /** Loaded factory + dealer-fit options — 16 items so the preview
     *  shows a heavy-spec'd boat, the way a real customer proposal
     *  rolls. Mix of fishing, comfort, electronics, dealer prep. */
    const selectedOptions = [
        { id: 'opt-t-top',           name: 'T-Top with Rocket Launcher (4-rod)',     category: 'Shade & Fishing',    sellPriceExclGst: 7800, imageUrl: null },
        { id: 'opt-bow-locker',      name: 'Insulated Bow Locker + Cushion',         category: 'Storage',            sellPriceExclGst: 2150, imageUrl: null },
        { id: 'opt-bench-storage',   name: 'Aft Bench Seat with Storage Compartment', category: 'Seating',           sellPriceExclGst: 2950, imageUrl: null },
        { id: 'opt-console-upgrade', name: 'Side-Console Upgrade (full glass-screen)', category: 'Console',          sellPriceExclGst: 3450, imageUrl: null },
        { id: 'opt-tube-cover',      name: 'Tube Cover (Sunbrella Charcoal)',        category: 'Protection',         sellPriceExclGst: 1850, imageUrl: null },
        { id: 'opt-bait-tank',       name: 'Live Bait Tank — 80L (with aerator pump)', category: 'Fishing',          sellPriceExclGst: 1495, imageUrl: null },
        { id: 'opt-bow-rail',        name: 'Stainless Steel Bow Rail (1m)',          category: 'Safety',             sellPriceExclGst: 1250, imageUrl: null },
        { id: 'opt-bimini',          name: 'Folding Bimini Top with Boot',           category: 'Shade',              sellPriceExclGst: 1650, imageUrl: null },
        { id: 'opt-led-nav',         name: 'LED Navigation Lights (port/stbd/stern)', category: 'Electrical',        sellPriceExclGst: 480,  imageUrl: null },
        { id: 'opt-led-underwater',  name: 'Underwater LED Lights (Blue, 4-pack)',   category: 'Electrical',         sellPriceExclGst: 680,  imageUrl: null },
        { id: 'opt-sounder-mount',   name: 'Garmin GPSMAP 9" Mount + Wiring Loom',   category: 'Electronics',        sellPriceExclGst: 520,  imageUrl: null },
        { id: 'opt-stereo',          name: 'Marine Stereo + Bluetooth + 4 Speakers', category: 'Electronics',        sellPriceExclGst: 1180, imageUrl: null },
        { id: 'opt-deluxe-uphol',    name: 'Deluxe Upholstery Upgrade (Charcoal)',   category: 'Comfort',            sellPriceExclGst: 1950, imageUrl: null },
        { id: 'opt-rod-holders',     name: 'Stainless Rod Holders (Gunwale × 6)',    category: 'Fishing',            sellPriceExclGst: 590,  imageUrl: null },
        { id: 'opt-ski-tow',         name: 'Stainless Ski Tow Eye + Bridle',         category: 'Watersports',        sellPriceExclGst: 320,  imageUrl: null },
        { id: 'opt-rear-step',       name: 'Stainless Rear Boarding Step + Ladder',  category: 'Boarding',           sellPriceExclGst: 870,  imageUrl: null },
    ];

    /** Motor placeholder — minimal until real data is fetched.
     *  No fake photos, no invented brands, no fake categories. The
     *  preview component overlays real motor data fetched from the
     *  org's motor module when available. Categories below use the
     *  ONLY three canonical motor accessory categories from the app:
     *  Propeller, Rigging, Other (see motor-options.tsx:139–196). */
    const motor = {
        id: 'motor-yamaha-f100',
        name: 'Yamaha F100',
        brand: 'Yamaha',
        brandLogoUrl: null,
        imageUrl: null,
        sellPriceExclGst: 18800,
        cost: 13200,
        hpRating: '100 HP',
        shaftLength: '20"',
        control: 'Mechanical',
        starting: 'Electric',
        tiltTrim: 'Power T&T',
        fuelTank: '24 L Internal',
        prop: 'Stainless 3-Blade',
        warranty: '5-Year Limited',
        accessories: [
            { name: 'Stainless Steel Propeller', category: 'Propeller', sellPriceExclGst: 850, imageUrl: null },
            { name: 'Mechanical Rigging Kit',    category: 'Rigging',   sellPriceExclGst: 1450, imageUrl: null },
            { name: 'Hydraulic Steering Kit',    category: 'Other',     sellPriceExclGst: 1620, imageUrl: null },
        ],
        // accessoryItems kept for the financials calc below.
        accessoryItems: [
            { name: 'Stainless Steel Propeller', sellPriceExclGst: 850 },
            { name: 'Mechanical Rigging Kit',    sellPriceExclGst: 1450 },
            { name: 'Hydraulic Steering Kit',    sellPriceExclGst: 1620 },
        ],
    };

    /** Trailer placeholder — uses a real brand from the trailer catalog
     *  (NSM Custom is the in-house brand, vendorId = nsm-custom-trailers).
     *  Spec field names match the real schema in seed-trailers.ts:96–115
     *  (boatSizeMtr / lengthMtr / atmKg / tareKg / wheelSize / winch /
     *  betweenGuardsMm / plug). The preview component overlays real
     *  trailer data fetched from the org's trailer brands when available. */
    const trailer = {
        id: 'trailer-placeholder-560',
        name: 'NSM Custom Tandem (suits 5.6 m hull)',
        brand: 'NSM Custom Trailers',
        brandLogoUrl: null,
        imageUrl: null,
        sellPriceExclGst: 11750,
        cost: 8200,
        catalog: {
            brandVendorId: 'nsm-custom-trailers',
            brandName: 'NSM Custom Trailers',
            seriesName: 'NSM Custom',
            code: 'NSM-560-T',
            imageUrl: null,
            specifications: {
                boatSizeMtr: 5.6,
                lengthMtr: 6.4,
                tareKg: 360,
                atmKg: 1800,
                wheelSize: '14" Galvanised',
                winch: 'Manual 5:1',
                betweenGuardsMm: 1980,
                plug: '7-Pin Flat',
            },
        },
        options: [
            { name: 'Spare Wheel + Carrier', sellPriceExclGst: 380 },
            { name: 'LED Submersible Lights', sellPriceExclGst: 290 },
        ],
    };

    const dealerFit = [
        { id: 'df-prep',         name: 'Pre-Delivery Inspection & Sea-Trial',           sellPriceExclGst: 1250, cost: 480 },
        { id: 'df-detail',       name: 'Premium Detail + Anti-Fouling (gel-coat sealed)', sellPriceExclGst: 720, cost: 280 },
        { id: 'df-rego-help',    name: 'Boat + Trailer Registration Service',           sellPriceExclGst: 320,  cost: 80  },
        { id: 'df-handover',     name: 'On-Water Hand-Over Training (2 hours)',         sellPriceExclGst: 480,  cost: 160 },
        { id: 'df-warranty-pack', name: 'Extended Marine Warranty Package (3-year)',    sellPriceExclGst: 980,  cost: 420 },
    ];

    const boatBasePrice = variant.sellPriceExclGst;
    const optionsTotal = selectedOptions.reduce((s, o) => s + o.sellPriceExclGst, 0);
    const motorTotal = motor.sellPriceExclGst + motor.accessoryItems.reduce((s, a) => s + a.sellPriceExclGst, 0);
    const trailerTotal = trailer.sellPriceExclGst + trailer.options.reduce((s, o) => s + o.sellPriceExclGst, 0);
    const dealerFitTotal = dealerFit.reduce((s, d) => s + d.sellPriceExclGst, 0);
    const regoTotal = 1480;
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
                name: 'James Thompson',
                email: 'james.thompson@example.com',
                phone: '0421 555 200',
                company: 'Pacific Bay Charters',
                address: '47 Marina Esplanade, Pacific Bay NSW 2480',
            },
            moduleId: 'preview-module',
            moduleName: 'Highfield Boats',
            moduleSlug: 'highfield',
            vendorId: opts.vendorId ?? 'highfield',
            vendorName: 'Highfield',
            vendorLogoUrl: null,
            vendorCurrency: 'USD',
            rangeId: 'sport',
            rangeName: 'Sport',
            rangeImageUrl: null,
            modelId: 'sport-560',
            modelName: 'Sport 560',
            modelCode: 'SP560',
            // Hardcoded boat photo — Unsplash CDN, CORS-permissive, stable.
            // (Free-use boat-on-water photo, closest visual approximation of
            // a Highfield Sport 560 we have without burning a real Highfield
            // CDN URL into the bundle.) v1.7.5 polish can swap to an actual
            // Sport 560 URL from the org's Firebase Storage when ready.
            coverImageUrl: 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1600&q=80',
            specifications: {
                otherSpecs: [
                    { label: 'Length',          value: '5.60 m' },
                    { label: 'Beam',            value: '2.30 m' },
                    { label: 'Internal Length', value: '4.20 m' },
                    { label: 'Internal Width',  value: '1.20 m' },
                    { label: 'Tube Diameter',   value: '0.50 m' },
                    { label: 'Air Chambers',    value: '5' },
                    { label: 'Dry Weight',      value: '410 kg' },
                    { label: 'Max Recommended HP', value: '100 HP' },
                    { label: 'Max Persons',     value: '9' },
                    { label: 'Fuel Capacity',   value: '120 L' },
                    { label: 'Max Speed',       value: '40 knots' },
                    { label: 'CE Category',     value: 'C — Inshore' },
                ],
                motorConfigurations: [{ engines: [{ minHp: 75, maxHp: 100 }] }],
            },
            standardFeatures: [
                'Marine-grade aluminium hull (3 mm bottom, 2 mm sides)',
                'Hypalon-1670 dtex tubes (5-chamber configuration)',
                'Self-bailing deck with 2 × auto-bilge pumps',
                'Forward console with hand grip + drink holders',
                'Stainless steel grab rails (full perimeter)',
                'Bow eye + 4 × stern lifting eyes',
                'Tow rings (4 × marine-grade stainless)',
                'Welded aluminium fuel tank — 120 L',
                'Pre-wired for navigation electronics',
                'Marine-grade vinyl upholstery (UV-stabilised)',
                'Full anti-skid floor surface',
                'Side carry handles (8 positions)',
                'Bow eye D-ring for trailer winch',
                '12 V outlet at console (waterproof)',
                'Battery box with isolator switch',
                'Fender storage compartment',
            ],
            variant,
            selectedOptions,
            customOptions: [],
            registration: {
                boatRego: true,
                trailerRego: true,
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
