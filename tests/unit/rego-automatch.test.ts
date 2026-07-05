import { describe, it, expect } from 'vitest';
import { parseBoatLengthM, pickAutoRegoBand, type RegoBandOption } from '@/lib/rego-automatch';

/**
 * 2026-07-04 fleet-walk handoff harness:
 * (1) RegoPicker auto-match parsed SKU-style model codes as hull length
 *     (HBS113 → "1.13m") — specs now authoritative, code fallback gated.
 * (2) QLD band catalogs overlap (legacy seeded $163 4.5-8m vs MPF $250
 *     4.51-6.0m for a 5.6m hull) — MPF bands win; concession bands never
 *     auto-apply.
 */

describe('parseBoatLengthM — hull length from specs/code, not SKU digits', () => {
    it('Length spec is authoritative (m, cm, mm normalised)', () => {
        expect(parseBoatLengthM(['HBS113'], [{ label: 'Overall Length', value: '5.60 m' }])).toBe(5.6);
        expect(parseBoatLengthM(['CL380'], [{ label: 'Length', value: '5600' }])).toBe(5.6);
        expect(parseBoatLengthM(['CL380'], [{ label: 'Hull Length', value: '380' }])).toBe(3.8);
    });
    it('Highfield range-prefixed codes encode length×100', () => {
        expect(parseBoatLengthM(['CL380'])).toBe(3.8);
        expect(parseBoatLengthM(['SP760ST'])).toBe(7.6);
        expect(parseBoatLengthM(['RU230KAM'])).toBe(2.3);
        expect(parseBoatLengthM(['PA860'])).toBe(8.6);
    });
    it('space-bounded tokens parse; glued SKU digits do NOT', () => {
        expect(parseBoatLengthM(['Coaster 540'])).toBe(5.4);
        expect(parseBoatLengthM(['Surtees - 770 Game Fisher'])).toBe(7.7);
        expect(parseBoatLengthM(['Stacer - 409 Assault Pro'])).toBe(4.09);
        // The field-reported bug: HBS-sku codes parsed as 1.13m nonsense.
        expect(parseBoatLengthM(['HBS113'])).toBeUndefined();
        expect(parseBoatLengthM(['SUR-770GF-261'])).toBeUndefined();
    });
    it('modelCode candidate falls through to the name candidate', () => {
        expect(parseBoatLengthM(['HBS113', 'CL380'])).toBe(3.8);
        expect(parseBoatLengthM(['SUR-770GF-261', 'Surtees - 770 Game Fisher'])).toBe(7.7);
    });
});

describe('pickAutoRegoBand — MPF bands beat legacy seeds, concessions never auto-apply', () => {
    // Real QLD catalog rows (data-warehouse/qld-transport/regoTypes).
    const qld: RegoBandOption[] = [
        { key: 'qld/boat-45m-to-8m', type: { id: 'boat-45m-to-8m', name: 'Recreational Vessel — 4.5m to 8m', minLengthM: 4.5, maxLengthM: 8 } },
        { key: 'qld/mpf-rego-2', type: { id: 'mpf-rego-2', name: '4.51m to 6.0m', minLengthM: 4.51, maxLengthM: 6 } },
        { key: 'qld/mpf-rego-3', type: { id: 'mpf-rego-3', name: '6.01m to 10.00m', minLengthM: 6.01, maxLengthM: 10 } },
        { key: 'qld/mpf-4.51m-to-6.0m-pensioner-concession', type: { id: 'mpf-4.51m-to-6.0m-pensioner-concession', name: '4.51m to 6.0m (Pensioner / Concession)', minLengthM: 4.51, maxLengthM: 6 } },
        { key: 'qld/trailer-751-1500', type: { id: 'trailer-751-1500', name: 'Boat Trailer — 751 to 1500kg ATM', minAtmKg: 751, maxAtmKg: 1500 } },
        { key: 'qld/mpf-rego-6', type: { id: 'mpf-rego-6', name: 'Small Trailers - Up to 1.02t', minAtmKg: 0, maxAtmKg: 1020 } },
    ];
    it('5.6m hull picks the MPF band ($250), not the legacy seed ($163)', () => {
        expect(pickAutoRegoBand(qld, { lengthM: 5.6 })?.key).toBe('qld/mpf-rego-2');
    });
    it('never auto-applies a pensioner/concession band', () => {
        const concessionOnly = qld.filter(o => /concession/i.test(o.type.name));
        expect(pickAutoRegoBand(concessionOnly, { lengthM: 5.6 })).toBeUndefined();
    });
    it('falls back to a legacy band when no MPF band matches', () => {
        const legacyOnly = qld.filter(o => !o.type.id.startsWith('mpf-'));
        expect(pickAutoRegoBand(legacyOnly, { lengthM: 5.6 })?.key).toBe('qld/boat-45m-to-8m');
    });
    it('trailer ATM matching prefers MPF trailer bands too', () => {
        expect(pickAutoRegoBand(qld, { atmKg: 900 })?.key).toBe('qld/mpf-rego-6');
    });
    it('no context, no match', () => {
        expect(pickAutoRegoBand(qld, {})).toBeUndefined();
        expect(pickAutoRegoBand(qld, { lengthM: 12 })).toBeUndefined();
    });
});
