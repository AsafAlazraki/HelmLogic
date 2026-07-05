import { describe, it, expect } from 'vitest';
import {
  applyStackedPromotions,
  netAfterRefunds,
  buyerSummary,
  buildDocStoragePath,
  customerEligiblePromotions,
} from '@/lib/catalog/v127-v128-features';
import { promotionDiscount, type Promotion } from '@/lib/catalog/promotion';

type P = Pick<Promotion, 'form' | 'value'>;
const pct = (value: number): P => ({ form: 'percent', value });
const fixed = (value: number): P => ({ form: 'fixed', value });
const free = (): P => ({ form: 'free-item', value: 0 });

/** Deterministic PRNG so the "30 combos" table is stable run-to-run. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('applyStackedPromotions — no-stack picks the best single promo (30 combos)', () => {
  const rand = mulberry32(42);
  const combos: Array<{ promos: P[]; subtotal: number }> = [];
  for (let i = 0; i < 30; i++) {
    const n = 1 + Math.floor(rand() * 4);
    const promos: P[] = [];
    for (let j = 0; j < n; j++) {
      const kind = Math.floor(rand() * 3);
      if (kind === 0) promos.push(pct(Math.floor(rand() * 40)));
      else if (kind === 1) promos.push(fixed(Math.floor(rand() * 800)));
      else promos.push(free());
    }
    combos.push({ promos, subtotal: 100 + Math.floor(rand() * 20000) });
  }

  it.each(combos.map((c, i) => [i, c] as const))(
    'combo %d: totalDiscount equals max single-promo discount',
    (_i, { promos, subtotal }) => {
      const res = applyStackedPromotions(promos, subtotal, { allowStacking: false });
      const best = Math.max(0, ...promos.map((p) => promotionDiscount(p, subtotal)));
      expect(res.totalDiscount).toBe(best);
      expect(res.applied).toBe(best > 0 ? 1 : 0);
      expect(res.totalDiscount).toBeLessThanOrEqual(subtotal);
    },
  );

  it('no promos -> zero discount, zero applied', () => {
    expect(applyStackedPromotions([], 5000, { allowStacking: false })).toEqual({ totalDiscount: 0, applied: 0 });
  });

  it('only descriptive promos -> zero discount, zero applied', () => {
    expect(applyStackedPromotions([free(), free()], 5000, { allowStacking: false })).toEqual({ totalDiscount: 0, applied: 0 });
  });

  it('maxStack is ignored when stacking is off', () => {
    const res = applyStackedPromotions([pct(10), pct(20)], 1000, { allowStacking: false, maxStack: 5 });
    expect(res.totalDiscount).toBe(200);
    expect(res.applied).toBe(1);
  });
});

describe('applyStackedPromotions — stacking behavior', () => {
  it('stacking caps at maxStack (best promos first)', () => {
    // 10% of 1000 = 100, fixed 150, 5% -> sorted [fixed 150, pct10, pct5]
    // maxStack 2: 150 then 10% of 850 = 85 -> 235 total. (verified in node)
    const res = applyStackedPromotions([pct(10), fixed(150), pct(5)], 1000, { allowStacking: true, maxStack: 2 });
    expect(res.totalDiscount).toBe(235);
    expect(res.applied).toBe(2);
  });

  it('no maxStack applies every promo', () => {
    // fixed 150 -> running 850; 10% of 850 = 85 -> running 765; 5% of 765 = 38 (round 38.25)
    const res = applyStackedPromotions([pct(10), fixed(150), pct(5)], 1000, { allowStacking: true });
    expect(res.totalDiscount).toBe(273);
    expect(res.applied).toBe(3);
  });

  it('maxStack 1 equals best-single behavior', () => {
    const promos = [pct(10), fixed(150), pct(5)];
    const stacked = applyStackedPromotions(promos, 1000, { allowStacking: true, maxStack: 1 });
    const single = applyStackedPromotions(promos, 1000, { allowStacking: false });
    expect(stacked.totalDiscount).toBe(single.totalDiscount);
    expect(stacked.applied).toBe(1);
  });

  it('discounts apply to the running balance, not the original subtotal', () => {
    // two 10% promos on 1000: 100 then 10% of 900 = 90 -> 190 (NOT 200)
    const res = applyStackedPromotions([pct(10), pct(10)], 1000, { allowStacking: true });
    expect(res.totalDiscount).toBe(190);
    expect(res.applied).toBe(2);
  });

  it('three 50% promos halve repeatedly: 500 + 250 + 125 = 875', () => {
    const res = applyStackedPromotions([pct(50), pct(50), pct(50)], 1000, { allowStacking: true });
    expect(res.totalDiscount).toBe(875);
    expect(res.applied).toBe(3);
  });

  it('fixed promos deplete the balance and the last is partially applied', () => {
    // 4 × fixed 300 on 1000: 300+300+300+min(100,300)=1000, applied 4
    const res = applyStackedPromotions([fixed(300), fixed(300), fixed(300), fixed(300)], 1000, { allowStacking: true });
    expect(res.totalDiscount).toBe(1000);
    expect(res.applied).toBe(4);
  });

  it('never exceeds subtotal: oversized fixed then 100% percent', () => {
    const res = applyStackedPromotions([fixed(2000), pct(100)], 1000, { allowStacking: true });
    expect(res.totalDiscount).toBe(1000);
    expect(res.applied).toBe(1); // the 100% promo hits a 0 running balance -> d=0, skipped
  });

  it('descriptive promos are skipped (d <= 0) and do not count as applied', () => {
    const res = applyStackedPromotions([free(), pct(10)], 1000, { allowStacking: true });
    expect(res.totalDiscount).toBe(100);
    expect(res.applied).toBe(1);
  });

  it('property: stacked total never exceeds subtotal (30 randomised combos)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 30; i++) {
      const n = 1 + Math.floor(rand() * 5);
      const promos: P[] = [];
      for (let j = 0; j < n; j++) {
        promos.push(rand() < 0.5 ? pct(Math.floor(rand() * 101)) : fixed(Math.floor(rand() * 5000)));
      }
      const subtotal = Math.floor(rand() * 10000);
      const res = applyStackedPromotions(promos, subtotal, { allowStacking: true, maxStack: 1 + Math.floor(rand() * n) });
      expect(res.totalDiscount).toBeLessThanOrEqual(subtotal);
      expect(res.totalDiscount).toBeGreaterThanOrEqual(0);
      expect(res.applied).toBeLessThanOrEqual(n);
    }
  });

  it('property: stacked total >= best single (stacking never does worse)', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 20; i++) {
      const promos: P[] = [pct(Math.floor(rand() * 50)), fixed(Math.floor(rand() * 1000)), pct(Math.floor(rand() * 50))];
      const subtotal = 500 + Math.floor(rand() * 20000);
      const stacked = applyStackedPromotions(promos, subtotal, { allowStacking: true });
      const single = applyStackedPromotions(promos, subtotal, { allowStacking: false });
      expect(stacked.totalDiscount).toBeGreaterThanOrEqual(single.totalDiscount);
    }
  });

  it('zero subtotal -> zero everything', () => {
    const res = applyStackedPromotions([pct(50), fixed(100)], 0, { allowStacking: true });
    expect(res.totalDiscount).toBe(0);
    expect(res.applied).toBe(0);
  });
});

describe('netAfterRefunds — sum property (30 cases)', () => {
  const rand = mulberry32(1234);
  const cases: Array<{ paid: number; refunds: Array<{ amountIncGst: number }>; expected: number }> = [];
  for (let i = 0; i < 30; i++) {
    const paid = Math.round(rand() * 100000) / 100;
    const n = Math.floor(rand() * 5);
    const refunds = Array.from({ length: n }, () => ({ amountIncGst: Math.round(rand() * 10000) / 100 }));
    const expected = paid - refunds.reduce((a, r) => a + r.amountIncGst, 0);
    cases.push({ paid, refunds, expected });
  }

  it.each(cases.map((c, i) => [i, c] as const))('case %d: net = paid - sum(refunds)', (_i, c) => {
    expect(netAfterRefunds(c.paid, c.refunds)).toBeCloseTo(c.expected, 8);
  });

  it('no refunds -> full paid amount', () => {
    expect(netAfterRefunds(1234.56, [])).toBe(1234.56);
  });

  it('null-ish refunds array tolerated', () => {
    expect(netAfterRefunds(500, null as any)).toBe(500);
    expect(netAfterRefunds(500, undefined as any)).toBe(500);
  });

  it('refund with missing amount counts as 0', () => {
    expect(netAfterRefunds(500, [{ amountIncGst: undefined as any }, { amountIncGst: 100 }])).toBe(400);
  });

  it('refunds can exceed paid (result goes negative, no clamping)', () => {
    expect(netAfterRefunds(100, [{ amountIncGst: 150 }])).toBe(-50);
  });

  it('full refund nets to zero', () => {
    expect(netAfterRefunds(999, [{ amountIncGst: 500 }, { amountIncGst: 499 }])).toBe(0);
  });
});

describe('buyerSummary', () => {
  it('primary and secondary joined with &', () => {
    expect(buyerSummary({ name: 'Alice' }, { name: 'Bob' })).toBe('Alice & Bob');
  });
  it('primary only', () => {
    expect(buyerSummary({ name: 'Alice' })).toBe('Alice');
  });
  it('secondary only', () => {
    expect(buyerSummary(undefined, { name: 'Bob' })).toBe('Bob');
  });
  it('neither -> Unknown', () => {
    expect(buyerSummary()).toBe('Unknown');
    expect(buyerSummary(undefined, undefined)).toBe('Unknown');
  });
  it('extra co-buyer fields are ignored in the summary', () => {
    expect(buyerSummary({ name: 'Alice', email: 'a@x.com', role: 'spouse' }, { name: 'Bob', phone: '123' })).toBe('Alice & Bob');
  });
});

describe('buildDocStoragePath — filename sanitization', () => {
  const table: Array<[string, string]> = [
    ['invoice.pdf', 'customers/c1/documents/invoice.pdf'],
    ['my invoice.pdf', 'customers/c1/documents/my_invoice.pdf'],
    ['a/b/c.pdf', 'customers/c1/documents/a_b_c.pdf'],           // slashes stripped (no path traversal)
    ['../../etc/passwd', 'customers/c1/documents/.._.._etc_passwd'], // dots survive, slashes don't
    ['licence (final) [v2].PDF', 'customers/c1/documents/licence__final___v2_.PDF'],
    ['UPPER-lower_123.jpeg', 'customers/c1/documents/UPPER-lower_123.jpeg'], // allowed chars untouched
    ['naïve résumé.docx', 'customers/c1/documents/na_ve_r_sum_.docx'],
    ['file name with  spaces.png', 'customers/c1/documents/file_name_with__spaces.png'],
    ['100%+tax&gst.xlsx', 'customers/c1/documents/100__tax_gst.xlsx'],
    ['', 'customers/c1/documents/'],
  ];
  it.each(table)('%j -> %j', (input, expected) => {
    expect(buildDocStoragePath('c1', input)).toBe(expected);
  });

  it('customer id is interpolated verbatim (not sanitized)', () => {
    expect(buildDocStoragePath('cust-42', 'x.pdf')).toBe('customers/cust-42/documents/x.pdf');
  });
});

describe('customerEligiblePromotions', () => {
  const promo = (over: any): Promotion => ({
    id: over.id ?? 'p', organisationId: 'o', name: 'n', form: 'percent', value: 10,
    active: true, createdAt: null, createdByUid: 'u', createdByName: 'U', ...over,
  });

  it('promo with no customerIds field is eligible for everyone', () => {
    const p = promo({ id: 'a' });
    expect(customerEligiblePromotions([p], 'cust1')).toEqual([p]);
  });

  it('promo with an empty customerIds list is eligible for everyone', () => {
    const p = promo({ id: 'b', customerIds: [] });
    expect(customerEligiblePromotions([p], 'cust1')).toEqual([p]);
  });

  it('promo restricted to the customer is eligible', () => {
    const p = promo({ id: 'c', customerIds: ['cust1', 'cust2'] });
    expect(customerEligiblePromotions([p], 'cust1')).toEqual([p]);
  });

  it('promo restricted to other customers is filtered out', () => {
    const p = promo({ id: 'd', customerIds: ['cust2'] });
    expect(customerEligiblePromotions([p], 'cust1')).toEqual([]);
  });

  it('mixed list keeps only global + matching promos, order preserved', () => {
    const a = promo({ id: 'a' });
    const b = promo({ id: 'b', customerIds: ['other'] });
    const c = promo({ id: 'c', customerIds: ['cust1'] });
    const d = promo({ id: 'd', customerIds: [] });
    expect(customerEligiblePromotions([a, b, c, d], 'cust1').map((p) => p.id)).toEqual(['a', 'c', 'd']);
  });

  it('null / undefined promotions list tolerated', () => {
    expect(customerEligiblePromotions(null as any, 'cust1')).toEqual([]);
    expect(customerEligiblePromotions(undefined as any, 'cust1')).toEqual([]);
  });
});
