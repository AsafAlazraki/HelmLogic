import { describe, it, expect } from 'vitest';
import {
    classifySection,
    modelSectionMatches,
    routeSection,
    itemRelevance,
    selectVariantRows,
    parseHpIntervals,
    parseLengthSpec,
    variantColourCodes,
    prettifySectionName,
    RELEVANCE_RULES,
    SIZE_CLASS_RULES,
    type CurationContext,
} from '@/lib/step5-curation';

/**
 * Step-5 dealer-fit curation harness (v1.31 addendum — Story 12.4.2).
 *
 * Part 1 is the FFR-24 33-case classifier harness, previously a verbatim
 * scratchpad port of highfield-quote-flow.tsx, now importing the REAL
 * module (the classifier moved to src/lib/step5-curation.ts). Any drift
 * between quote flow and harness is impossible by construction now.
 *
 * Part 2 adds one suite per named curation rule from the 2026-07-04
 * field-audit fixes (Asaf): model-pack variant dedupe, HP envelope,
 * length scoping, supply-&-install sub-items, engine removals, material,
 * steering config, size-class thresholds, keyword routing, prettifier.
 */

// ------------------------------------------------------------------ helpers

const visible = (modelName: string, vendorName: string, section: string): boolean => {
    const k = classifySection(section);
    if (k === 'hidden' || k === 'workshop') return false;
    if (k === 'model' && !modelSectionMatches(section, { modelName, vendorName })) return false;
    return true;
};

// CL380 tender: 3.8 m hull, 15–30hp envelope, PVC White/White variant.
const cl380: CurationContext = {
    modelName: 'CL380',
    vendorName: 'Highfield Boats',
    hullLengthM: 3.8,
    minHp: 15,
    maxHp: 30,
    variantSku: 'HBC065',
    variantName: 'CL380 — White / White / Wood Dark',
    variantMaterial: 'PVC',
};

// SP760 sport RIB: 7.6 m, 250–300hp, remote steer.
const sp760: CurationContext = {
    modelName: 'SP760',
    vendorName: 'Highfield Boats',
    hullLengthM: 7.6,
    minHp: 250,
    maxHp: 300,
    engConfiguration: 'Remote',
    variantMaterial: 'HYP',
};

// --------------------------------------- Part 1: FFR-24 classifier (33 cases)

describe('FFR-24 classifier harness (33 legacy cases, verbatim expectations)', () => {
    const cases: Array<[string, string, string, boolean]> = [
        // FFR-19 regression guard
        ['CL290', 'Highfield', 'Highfield - Classic 290', true],
        ['CL290', 'Highfield', 'HIGHFIELD - Patrol', false],
        ['CL290', 'Highfield', 'TUBE COVER OPTIONS - To suit Highfield Boats', true],
        ['CL290', 'Highfield', 'Garmin', true],
        ['CL290', 'Highfield', 'PRE DELIVERY OPERATIONS - Stacer', false],
        ['SP560', 'Highfield', 'HIGHFIELD - Sport 560', true],
        ['SP560', 'Highfield', 'HIGHFIELD - Patrol', false],
        ['SP560', 'Highfield', 'HIGHFIELD - Patrol 560', false],
        // NEW-1 digit-collision residuals
        ['SP330', 'Highfield', 'HIGHFIELD - ZeroJet 330', false],
        ['SP330', 'Highfield', 'HIGHFIELD - Sport 330', true],
        ['CL460', 'Highfield', 'HIGHFIELD - Sport 460', false],
        ['CL460', 'Highfield', 'Highfield - Classic 460', true],
        ['Coaster 540', 'Highfield', 'HIGHFIELD - Patrol 540', false],
        ['Coaster 600', 'Highfield', 'HIGHFIELD - Sport 600', false],
        // Surtees seeing HF packs (NEW-1 example)
        ['Surtees - 540 Gamefisher', 'Surtees', 'HIGHFIELD - Patrol 540', false],
        ['Surtees - 700 Gamefisher', 'Surtees', 'HIGHFIELD - Sport 700', false],
        ['Surtees - 540 Gamefisher', 'Surtees', 'TUBE COVER OPTIONS - To suit Highfield Boats', false],
        ['Surtees - 540 Gamefisher', 'Surtees', 'Garmin', true],
        ['Stacer - 409 Assault Pro', 'Stacer', 'TUBE COVER OPTIONS - To suit Highfield Boats', false],
        ['Stacer - 409 Assault Pro', 'Stacer', 'JEANNEAU SPECIFIC OPTIONS', false],
        ['Jeanneau NC 895', 'Jeanneau', 'JEANNEAU SPECIFIC OPTIONS', true],
        ['Stabicraft 1450', 'Stabicraft', 'STABICRAFT SPECIFIC OPTIONS', true],
        ['Surtees - 540 Gamefisher', 'Surtees', 'STABICRAFT SPECIFIC OPTIONS', false],
        // NEW-2 Roll-Up floor packs
        ['RU230KAM', 'Highfield', 'HIGHFIELD - Roll-Up 230 w Airmat Floor', true],
        ['RU230KAM', 'Highfield', 'HIGHFIELD - Roll-Up 230 w Aluminium Floor', false],
        ['RU230AL', 'Highfield', 'HIGHFIELD - Roll-Up 230 w Aluminium Floor', true],
        ['RU230AL', 'Highfield', 'HIGHFIELD - Roll-Up 230 w Airmat Floor', false],
        ['RU230AL', 'Highfield', 'HIGHFIELD - Roll-Up 250 w Aluminium Floor', false],
        ['RU250 Easy Go', 'Highfield', 'HIGHFIELD - Roll-Up 250 w Airmat Floor', false],
        ['RU250 Easy Go', 'Highfield', 'HIGHFIELD - Roll-Up 250 w Aluminium Floor', false],
        ['RU320KAM', 'Highfield', 'HIGHFIELD - Roll-Up 320 w Airmat Floor', true],
        ['UL240', 'Highfield', 'Highfield - Ultralite 240', true],
        ['UL240', 'Highfield', 'Highfield - Ultralite 220', false],
    ];

    it('has exactly the 33 legacy cases', () => {
        expect(cases.length).toBe(33);
    });

    for (const [model, vendor, section, expected] of cases) {
        it(`${model} (${vendor}) × '${section}' → ${expected ? 'visible' : 'hidden'}`, () => {
            expect(visible(model, vendor, section)).toBe(expected);
        });
    }
});

// -------------------------- Part 2: v1.31 curation rules (field-audit fixes)

describe('section classes — workshop operations (R-NEWBOAT / R-WORKSHOP)', () => {
    it('ENGINE REMOVALS is workshop-class (hidden by default, Show-all revealable)', () => {
        expect(classifySection('ENGINE REMOVALS')).toBe('workshop');
    });
    it('SURVEYING SUBLETS is workshop-class', () => {
        expect(classifySection('SURVEYING SUBLETS')).toBe('workshop');
    });
    it('rigging kits stay hard-hidden (never customer-facing on the boat step)', () => {
        expect(classifySection('MECHANICAL RIGGING KITS (Up to 70HP)')).toBe('hidden');
        expect(classifySection('HELM MASTER - LEVEL 2 - RIGGING KITS (Bolt On DES)')).toBe('hidden');
    });
});

describe('keyword section routing (finding 2e)', () => {
    it('outboard/tiller/prop sections route to the MOTOR dealer-fit group', () => {
        expect(routeSection('OUTBOARD ACCESSORIES')).toBe('motor');
        expect(routeSection('TILLER FITTING KITS')).toBe('motor');
        expect(routeSection('PROPELLER OPTIONS')).toBe('motor');
    });
    it('trailer accessory/setup sections route to the TRAILER group', () => {
        expect(routeSection('TRAILER SETUPS')).toBe('trailer');
        expect(routeSection('TRAILER ACCESSORIES')).toBe('trailer');
    });
    it('ordinary sections do not route', () => {
        expect(routeSection('GARMIN ELECTRONIC OPTIONS')).toBeNull();
        expect(routeSection('BATTERY INSTALLATIONS')).toBeNull();
        expect(routeSection('TUBE COVER OPTIONS - To suit Highfield Boats')).toBeNull();
    });
});

describe('R-SUBITEM — Supply & Install job-card sub-items (finding 2c)', () => {
    it('hides "Supply & Install -" prefixed rows', () => {
        expect(itemRelevance('Supply & Install - Fuel Line Assy - Non Genuine', cl380))
            .toEqual({ visible: false, rule: 'R-SUBITEM' });
        expect(itemRelevance('SUPPLY & INSTALL - Tilt Limit Switch F50 - F70', sp760).rule)
            .toBe('R-SUBITEM');
    });
    it('does not hide items merely containing the words mid-name', () => {
        expect(itemRelevance('Battery Box Supply & Install Kit', cl380).visible).toBe(true);
    });
});

describe('R-NEWBOAT — engine removals never on a new-boat quote (finding 2d)', () => {
    it('hides Engine Removal items', () => {
        expect(itemRelevance('Engine Removal - Up to 30hp', cl380).rule).toBe('R-NEWBOAT');
        expect(itemRelevance('Engine Removal (Twin Rigs) - Up to 2 x 30hp', sp760).rule).toBe('R-NEWBOAT');
    });
});

describe('R-HP — HP-scoped items must overlap the motor envelope (finding 2a)', () => {
    it('parses HP intervals conservatively', () => {
        expect(parseHpIntervals('Fuel Line , Yamaha - 115 to 225HP Genuine')).toEqual([[115, 225]]);
        expect(parseHpIntervals('Yamaha Small Fuel Filter - Up to 70HP')).toEqual([[0, 70]]);
        expect(parseHpIntervals('Engine Removal - Above 300hp')).toEqual([[300, Infinity]]);
        expect(parseHpIntervals('Cowl Cover to suit F115/F130')).toEqual([[115, 115], [130, 130]]);
        // Bare numbers and radio model codes are NOT horsepower.
        expect(parseHpIntervals('VHF Radio - Garmin VHF115i Flush Mounted')).toEqual([]);
        expect(parseHpIntervals('VHF Radio - GME GX700B')).toEqual([]);
        expect(parseHpIntervals('Garmin EchoMap Ultra 2 105sv w GT56 UHD Tducer')).toEqual([]);
    });
    it('hides F115+ gear on a 15-30hp tender', () => {
        expect(itemRelevance('Cowl Cover to suit F115/F130', cl380).rule).toBe('R-HP');
        expect(itemRelevance('Supply & Install - Fuel Line , Yamaha - 115 to 225HP Genuine', cl380).rule)
            .toBe('R-SUBITEM'); // sub-item rule wins first
        expect(itemRelevance('Fuel Line , Yamaha - 115 to 225HP Genuine', cl380).rule).toBe('R-HP');
    });
    it('keeps envelope-compatible HP gear', () => {
        expect(itemRelevance('Cowl Cover to suit F20/F25 (Electric Start)', cl380).visible).toBe(true);
        expect(itemRelevance('Yamaha Small Fuel Filter - Up to 70HP', cl380).visible).toBe(true);
        expect(itemRelevance('Cowl Cover to suit F225/250/300 4.2L V6 (SB & CB Models)', sp760).visible).toBe(true);
    });
    it('fails open with no envelope', () => {
        const noEnv: CurationContext = { modelName: 'X', vendorName: 'Y' };
        expect(itemRelevance('Cowl Cover to suit F115/F130', noEnv).visible).toBe(true);
    });
});

describe('R-LEN — length-scoped items within ±0.4m of hull length (finding 2b)', () => {
    it('parses single and range metre specs', () => {
        expect(parseLengthSpec('Tube Covers to suit PVC Boat - 5.6 Mtr')).toEqual({ single: 5.6 });
        expect(parseLengthSpec('Trailer Adjustment - 12 to 14ft (3.6 to 4.5mtr)')).toEqual({ range: [3.6, 4.5] });
        // Aerials and mm measurements are not hull lengths.
        expect(parseLengthSpec('VHF Radio with 1.8m Aerial')).toEqual({});
        expect(parseLengthSpec('2 x Narva 183mm STRIP LIGHTS')).toEqual({});
        // Component dimensions with explicit mtr tokens are skipped too
        // (live-data regression: every Fusion stereo hid via '1.8mtr Aerial').
        expect(parseLengthSpec('Fusion Apollo RA670 Stereo with XS 6.5" Speakers + 1.8mtr Aerial')).toEqual({});
        expect(parseLengthSpec('Winch Kit w 6mtr Cable')).toEqual({});
    });
    it('keeps covers within ±0.4m, hides the rest', () => {
        expect(itemRelevance('Tube Covers to suit PVC Boat - 3.6 Mtr', cl380).visible).toBe(true);
        expect(itemRelevance('Tube Covers to suit PVC Boat - 4.2 Mtr', cl380).visible).toBe(true);
        expect(itemRelevance('Tube Covers to suit PVC Boat - 5.6 Mtr', cl380).rule).toBe('R-LEN');
        expect(itemRelevance('Tube Covers to suit PVC Boat - 2.0 Mtr', cl380).rule).toBe('R-LEN');
    });
    it('range-scoped items must span the hull length', () => {
        expect(itemRelevance('Trailer Adjustment - 12 to 14ft (3.6 to 4.5mtr)', cl380).visible).toBe(true);
        expect(itemRelevance('Trailer Adjustment - 18 to 20ft (5.4 to 6.3mtr)', cl380).rule).toBe('R-LEN');
        expect(itemRelevance('Trailer Adjustment - 24ft (7.3mtr) and above', sp760).visible).toBe(true);
    });
    it('fails open with no hull length', () => {
        expect(itemRelevance('Tube Covers to suit PVC Boat - 5.6 Mtr', { modelName: 'X', vendorName: 'Y' }).visible).toBe(true);
    });
});

describe('R-MATERIAL — PVC/Hypalon items follow the active variant', () => {
    it('hides Hypalon covers on a PVC hull and vice versa', () => {
        expect(itemRelevance('Tube Covers to suit Hypalon Boat - 3.8 Mtr', cl380).rule).toBe('R-MATERIAL');
        expect(itemRelevance('Tube Covers to suit PVC Boat - 3.8 Mtr', cl380).visible).toBe(true);
        expect(itemRelevance('Tube Covers to suit PVC Boat - 7.6 Mtr', sp760).rule).toBe('R-MATERIAL');
    });
    it('fails open with no variant material', () => {
        expect(itemRelevance('Tube Covers to suit Hypalon Boat - 3.8 Mtr', { ...cl380, variantMaterial: undefined }).visible).toBe(true);
    });
});

describe('R-CONFIG — tiller items only on tiller-steer boats', () => {
    it('hides tiller conversion kits on a remote-steer build', () => {
        expect(itemRelevance('Tiller Conversion Kit - F25 SWC', { ...sp760, minHp: undefined, maxHp: undefined }).rule).toBe('R-CONFIG');
    });
    it('keeps them on tiller boats and when config is unknown', () => {
        expect(itemRelevance('Tiller Conversion Kit - F25 SWC', { ...cl380, engConfiguration: 'Tiller' }).visible).toBe(true);
        expect(itemRelevance('Tiller Conversion Kit - F25 SWC', cl380).visible).toBe(true); // no engConfiguration → fail open
    });
});

describe('R-SIZE-* — big-ticket gear gated on hull class', () => {
    it('documents every size rule with a rationale', () => {
        for (const rule of SIZE_CLASS_RULES) {
            expect(RELEVANCE_RULES.some(r => r.id === rule.id && r.rationale.length > 10)).toBe(true);
        }
    });
    it('hides TVs / radar / underwater lights / electric-reel wiring on a 3.8m tender', () => {
        expect(itemRelevance('Majestic 22" Smart TV w Mounting Bracket', cl380).rule).toBe('R-SIZE-TV');
        expect(itemRelevance('Garmin GMR18 Radome', cl380).rule).toBe('R-SIZE-RADAR');
        expect(itemRelevance('Underwater Lights Ocean LED X4 Midnight Blue (Qty 2)', cl380).rule).toBe('R-SIZE-UWLIGHT');
        expect(itemRelevance('Marinco 3 Pin Plug & Wiring for Electric Reels (Qty 2)', cl380).rule).toBe('R-SIZE-EREEL');
    });
    it('keeps them on a 7.6m sport RIB', () => {
        expect(itemRelevance('Majestic 22" Smart TV w Mounting Bracket', sp760).visible).toBe(true);
        expect(itemRelevance('Garmin GMR18 Radome', sp760).visible).toBe(true);
        expect(itemRelevance('Underwater Lights Ocean LED X4 Midnight Blue (Qty 2)', sp760).visible).toBe(true);
        expect(itemRelevance('Marinco 3 Pin Plug & Wiring for Electric Reels (Qty 2)', sp760).visible).toBe(true);
    });
});

describe('model-pack variant dedupe (finding 1: one card, not eight)', () => {
    // Real CL380 pack rows (organisations/.../dealerFitSelections,
    // category 'Highfield - Classic 380') — all $813, one per SKU.
    const cl380Pack = [
        { id: '9hi-hbc-065-pd', code: '9HI_HBC 065_PD', name: 'Classic - CL380 PVC - W-W' },
        { id: '9hi-hbc-066-pd', code: '9HI_HBC 066_PD', name: 'Classic - CL380 HYP - W-W' },
        { id: '9hi-hbc-067-pd', code: '9HI_HBC 067_PD', name: 'Classic - CL380 PVC - LG-W' },
        { id: '9hi-hbc-068-pd', code: '9HI_HBC 068_PD', name: 'Classic - CL380 HYP - LG-W' },
        { id: '9hi-hbc-069-pd', code: '9HI_HBC 069_PD', name: 'Classic - CL380 PVC - DG-G' },
        { id: '9hi-hbc-070-pd', code: '9HI_HBC 070_PD', name: 'Classic - CL380 HYP - DG-G' },
        { id: '9hi-hbc-071-pd', code: '9HI_HBC 071_PD', name: 'Classic - CL380 PVC - B-G' },
        { id: '9hi-hbc-072-pd', code: '9HI_HBC 072_PD', name: 'Classic - CL380 HYP - B-G' },
    ];
    it('SKU-embed primary match: HBC065 variant → exactly the 065 row', () => {
        const rows = selectVariantRows(cl380Pack, cl380);
        expect(rows.map(r => r.id)).toEqual(['9hi-hbc-065-pd']);
    });
    it('HYP Black/Grey variant → exactly the 072 row', () => {
        const rows = selectVariantRows(cl380Pack, {
            ...cl380,
            variantSku: 'HBC072',
            variantName: 'CL380 — Black / Grey / Dark Grey',
            variantMaterial: 'HYP',
        });
        expect(rows.map(r => r.id)).toEqual(['9hi-hbc-072-pd']);
    });
    it('name-based fallback (no SKU): material + colour narrow to one row', () => {
        const rows = selectVariantRows(cl380Pack, { ...cl380, variantSku: undefined });
        expect(rows.map(r => r.id)).toEqual(['9hi-hbc-065-pd']);
    });
    it('variant colour codes parse from the variant name', () => {
        expect(variantColourCodes('CL380 — White / White / Wood Dark')).toEqual(['W', 'W', 'WD']);
        expect(variantColourCodes('PA420 — Light Grey / White / Dark Grey')).toEqual(['LG', 'W', 'DG']);
    });
    it('fails open with no variant context', () => {
        const rows = selectVariantRows(cl380Pack, { modelName: 'CL380', vendorName: 'Highfield Boats' });
        expect(rows.length).toBe(8);
    });
    it('digitless range section (HIGHFIELD - Patrol): narrows to the quoted model', () => {
        const patrolPack = [
            { id: 'p1', code: '9HI_HBP 001_PD', name: 'Patrol - PA420 OB PVC - LG-W-DG' },
            { id: 'p2', code: '9HI_HBP 002_PD', name: 'Patrol - PA420 OB HYP - LG-W-DG' },
            { id: 'p3', code: '9HI_HBP 021_PD', name: 'Patrol - PA460 OB PVC - LG-W-DG' },
        ];
        const rows = selectVariantRows(patrolPack, {
            modelName: 'PA420',
            vendorName: 'Highfield Boats',
            variantName: 'PA420 — Light Grey / White / Dark Grey',
            variantMaterial: 'PVC',
        });
        expect(rows.map(r => r.id)).toEqual(['p1']);
    });
});

describe('section display prettifier (finding 3)', () => {
    it('maps the known jarring supplier headings', () => {
        expect(prettifySectionName('MAJESTIC TV OPTIONS')).toBe('TV & Entertainment');
        expect(prettifySectionName('GARMIN ELECTRONIC OPTIONS')).toBe('Electronics — Garmin');
        expect(prettifySectionName('MPF – Uncategorised')).toBe('VHF Radios & Safety');
        expect(prettifySectionName('TUBE COVER OPTIONS - To suit Highfield Boats')).toBe('Tube Covers');
        expect(prettifySectionName('MINN KOTA MOTOR OPTIONS')).toBe('Electric Motors — Minn Kota');
        expect(prettifySectionName('TRAILER SETUPS')).toBe('Trailer Setup & Adjustment');
    });
    it('model packs become Boat Pack — <model>', () => {
        expect(prettifySectionName('Highfield - Classic 380')).toBe('Boat Pack — Classic 380');
        expect(prettifySectionName('HIGHFIELD - Patrol')).toBe('Boat Pack — Patrol');
    });
    it('generic fallback title-cases and keeps content', () => {
        expect(prettifySectionName('SOME NEW SUPPLIER OPTIONS')).toBe('Some New Supplier Options');
    });
});
