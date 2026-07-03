import { describe, it, expect } from 'vitest';
import { buildQuoteFinancials } from '@/lib/quote-financials';

/**
 * Unit tests for buildQuoteFinancials (src/lib/quote-financials.ts).
 * All expected inc-GST values below were computed with Node's actual
 * float semantics for Math.ceil(x * 1.1) — some look surprising
 * (e.g. 100 -> 111, 50000 -> 55001) but that IS the deployed behavior:
 * 100 * 1.1 === 110.00000000000001 in IEEE-754, and ceil rounds it up.
 */

const bare = (exGst: number) => ({ variant: { sellPriceExclGst: exGst } });

describe('buildQuoteFinancials — GST = Math.ceil(exGst * 1.1) sweep', () => {
  // [exGst, expected totalInclGst] — 112 verified rows incl. float-quirk edges.
  const GST_TABLE: Array<[number, number]> = [
    [0, 0],
    [0.01, 1],
    [0.05, 1],
    [0.1, 1],
    [0.5, 1],
    [0.9, 1],
    [0.99, 2],
    [1, 2],
    [1.01, 2],
    [1.99, 3],
    [5, 6],
    [9.09, 10],
    [9.1, 11],
    [9.99, 11],
    [10, 11],
    [10.01, 12],
    [45.45, 50],
    [50, 56],
    [90.9, 100],
    [90.91, 101],
    [99, 109],
    [99.99, 110],
    [100, 111], // float quirk: 100*1.1 = 110.00000000000001
    [100.01, 111],
    [123.45, 136],
    [199.99, 220],
    [200, 221], // float quirk
    [250, 275],
    [454.54, 500],
    [454.55, 501],
    [499.99, 550],
    [500, 550],
    [909.09, 1000],
    [909.1, 1001],
    [999, 1099],
    [999.99, 1100],
    [1000, 1100],
    [1000.01, 1101],
    [1234.56, 1359],
    [1499.99, 1650],
    [1500, 1651], // float quirk
    [2499.99, 2750],
    [2500, 2750],
    [3333.33, 3667],
    [4545.45, 5000],
    [4999.95, 5500],
    [5000, 5500],
    [7224.29, 7947],
    [9090.9, 10000],
    [9090.91, 10001],
    [9999.99, 11000],
    [10000, 11000],
    [10000.01, 11001],
    [12345.67, 13581],
    [15000, 16500],
    [19999.99, 22000],
    [20000, 22000],
    [24999.99, 27500],
    [25000, 27501], // float quirk
    [33333.33, 36667],
    [39815, 43797],
    [45454.54, 50000],
    [45454.55, 50001],
    [49999.99, 55000],
    [50000, 55001], // float quirk
    [65000, 71500],
    [72727.27, 80000],
    [75000, 82500],
    [88888.88, 97778],
    [90909.09, 100000],
    [90909.1, 100001],
    [99999.99, 110000],
    [100000, 110001], // float quirk
    [100000.01, 110001],
    [123456.78, 135803],
    [150000, 165000],
    [175500.5, 193051],
    [199999.99, 220000],
    [200000, 220001], // float quirk
    [222222.22, 244445],
    [249999.99, 275000],
    [250000, 275000],
    [275000.75, 302501],
    [299999.99, 330000],
    [300000, 330000],
    [333333.33, 366667],
    [350000, 385001], // float quirk
    [399999.99, 440000],
    [400000, 440001], // float quirk
    [444444.44, 488889],
    [454545.45, 500000],
    [500000, 550000],
    [555555.55, 611112],
    [650000, 715000],
    [750000, 825001], // float quirk
    [876543.21, 964198],
    [999999.99, 1100000],
    [1000000, 1100000],
    [1234567.89, 1358025],
    [2000000, 2200000],
    [0.02, 1],
    [0.03, 1],
    [0.07, 1],
    [0.11, 1],
    [0.13, 1],
    [1.1, 2],
    [2.2, 3],
    [3.3, 4],
    [11, 13], // float quirk: 11*1.1 = 12.100000000000001
    [22, 25],
    [33, 37],
    [110, 122], // float quirk
  ];

  it.each(GST_TABLE)('exGst %d -> totalInclGst %d', (exGst, expectedInc) => {
    const f = buildQuoteFinancials(bare(exGst));
    expect(f.subtotalExclGst).toBe(exGst);
    expect(f.finalTotalPriceExclGst).toBe(exGst);
    expect(f.totalInclGst).toBe(expectedInc);
    // gstAmount is defined as totalInclGst - finalTotalPriceExclGst
    expect(f.gstAmount).toBe(expectedInc - exGst);
    // totalInclGst is always a whole-dollar integer
    expect(Number.isInteger(f.totalInclGst)).toBe(true);
  });

  it('inc-GST is never below the mathematical 1.1x (ceil never rounds down)', () => {
    for (const [exGst, inc] of GST_TABLE) {
      expect(inc + 1e-6).toBeGreaterThanOrEqual(exGst * 1.1);
      // and never more than a dollar (+ float epsilon) above it
      expect(inc - exGst * 1.1).toBeLessThan(1 + 1e-6);
    }
  });
});

describe('buildQuoteFinancials — discount handling', () => {
  it('discount subtracts from subtotal before GST', () => {
    const f = buildQuoteFinancials(bare(10000), 500);
    expect(f.subtotalExclGst).toBe(10000);
    expect(f.finalTotalPriceExclGst).toBe(9500);
    expect(f.totalInclGst).toBe(Math.ceil(9500 * 1.1));
    expect(f.totalInclGst).toBe(10450); // 9500*1.1 lands at/below 10450 in floats -> ceil 10450
  });

  it('discount defaults to 0', () => {
    const f = buildQuoteFinancials(bare(1234.56));
    expect(f.finalTotalPriceExclGst).toBe(1234.56);
  });

  it('discount equal to subtotal zeros the total', () => {
    const f = buildQuoteFinancials(bare(5000), 5000);
    expect(f.finalTotalPriceExclGst).toBe(0);
    expect(f.totalInclGst).toBe(0);
    expect(f.gstAmount).toBe(0);
    // margin guard: finalTotal <= 0 -> marginPercent 0
    expect(f.marginPercent).toBe(0);
  });

  it('discount larger than subtotal produces a negative ex-GST total (no clamping)', () => {
    // TODO-BUG? buildQuoteFinancials does not clamp over-discounts; current
    // behavior lets the total go negative. Asserting current behavior.
    const f = buildQuoteFinancials(bare(1000), 1500);
    expect(f.finalTotalPriceExclGst).toBe(-500);
    expect(f.totalInclGst).toBe(Math.ceil(-500 * 1.1));
    expect(f.totalInclGst).toBe(-550);
    expect(f.marginPercent).toBe(0); // guard only fires for > 0
  });

  it('fractional discount', () => {
    const f = buildQuoteFinancials(bare(999.99), 99.99);
    expect(f.finalTotalPriceExclGst).toBeCloseTo(900, 10);
    expect(f.totalInclGst).toBe(Math.ceil((999.99 - 99.99) * 1.1));
  });

  const discountTable: Array<[number, number, number]> = [
    // [subtotal, discount, expected finalExGst]
    [100, 10, 90],
    [100, 0, 100],
    [50000, 2500, 47500],
    [7224.29, 224.29, 7000],
    [1, 0.5, 0.5],
  ];
  it.each(discountTable)('subtotal %d - discount %d = %d exGst', (sub, disc, final) => {
    const f = buildQuoteFinancials(bare(sub), disc);
    expect(f.finalTotalPriceExclGst).toBeCloseTo(final, 8);
    expect(f.subtotalExclGst).toBe(sub); // discount never touches the subtotal line
  });
});

describe('buildQuoteFinancials — fitUpSelections qty × (priceOverride ?? sellPrice ?? cost)', () => {
  const fit = (sel: any[]) => buildQuoteFinancials({ fitUpSelections: sel });

  it('priceOverride wins over sellPrice and cost', () => {
    const f = fit([{ quantity: 2, priceOverride: 150, sellPrice: 200, cost: 100 }]);
    expect(f.fitUpTotal).toBe(300);
  });

  it('sellPrice used when no override', () => {
    const f = fit([{ quantity: 3, sellPrice: 200, cost: 100 }]);
    expect(f.fitUpTotal).toBe(600);
  });

  it('cost used when neither override nor sellPrice', () => {
    const f = fit([{ quantity: 2, cost: 100 }]);
    expect(f.fitUpTotal).toBe(200);
  });

  it('priceOverride of 0 is honoured (nullish check, not falsy)', () => {
    const f = fit([{ quantity: 4, priceOverride: 0, sellPrice: 200, cost: 100 }]);
    expect(f.fitUpTotal).toBe(0);
  });

  it('sellPrice of 0 is honoured over cost (nullish check on sellPrice)', () => {
    const f = fit([{ quantity: 1, sellPrice: 0, cost: 100 }]);
    expect(f.fitUpTotal).toBe(0);
  });

  it('legacy snapshot without quantity defaults to qty 1', () => {
    const f = fit([{ sellPrice: 250 }]);
    expect(f.fitUpTotal).toBe(250);
  });

  it('quantity 0 clamps up to 1 (Math.max(1, qty))', () => {
    const f = fit([{ quantity: 0, sellPrice: 250 }]);
    expect(f.fitUpTotal).toBe(250);
  });

  it('negative quantity clamps up to 1', () => {
    const f = fit([{ quantity: -3, sellPrice: 250 }]);
    expect(f.fitUpTotal).toBe(250);
  });

  it('null quantity defaults to 1 via ??', () => {
    const f = fit([{ quantity: null, sellPrice: 99 }]);
    expect(f.fitUpTotal).toBe(99);
  });

  it('empty selection object contributes 0 (cost || 0 fallback)', () => {
    const f = fit([{}]);
    expect(f.fitUpTotal).toBe(0);
  });

  it('multiple lines sum', () => {
    const f = fit([
      { quantity: 2, priceOverride: 100 }, // 200
      { quantity: 3, sellPrice: 50 },      // 150
      { cost: 25 },                        // 25
    ]);
    expect(f.fitUpTotal).toBe(375);
  });

  it('missing fitUpSelections -> fitUpTotal 0', () => {
    const f = buildQuoteFinancials({});
    expect(f.fitUpTotal).toBe(0);
    expect(f.fitUpCost).toBe(0);
  });

  describe('fitUp cost side', () => {
    it('cost field preferred, multiplied by quantity', () => {
      const f = fit([{ quantity: 3, cost: 80, sellPrice: 200 }]);
      expect(f.fitUpCost).toBe(240);
    });

    it('cost 0 is honoured (nullish check)', () => {
      const f = fit([{ quantity: 2, cost: 0, sellPrice: 200 }]);
      expect(f.fitUpCost).toBe(0);
    });

    it('missing cost falls back to 60% of sellPrice', () => {
      const f = fit([{ quantity: 2, sellPrice: 200 }]);
      expect(f.fitUpCost).toBe(240); // 2 * 200*0.6
    });

    it('priceOverride does NOT affect cost (cost is a catalog property)', () => {
      const f = fit([{ quantity: 1, priceOverride: 9999, cost: 50, sellPrice: 100 }]);
      expect(f.fitUpCost).toBe(50);
      expect(f.fitUpTotal).toBe(9999);
    });

    it('no cost and no sellPrice -> cost 0', () => {
      const f = fit([{ quantity: 5, priceOverride: 10 }]);
      expect(f.fitUpCost).toBe(0);
    });
  });
});

describe('buildQuoteFinancials — aggregation across sections', () => {
  const fullQuote = {
    variant: { sellPriceExclGst: 10000, cost: 7000 },
    selectedOptions: [
      { sellPriceExclGst: 500, cost: 300 },
      { sellPriceExclGst: 250 }, // cost falls back to 0.7
    ],
    customOptions: [{ sellPriceExclGst: 100 }], // cost falls back to 0.8
    registration: {
      boatRegoPrice: 150,
      stickerPrice: 25,
      tenderToPrice: 40,
      trailerRegoPrice: 85,
    },
    motor: {
      sellPriceExclGst: 8000,
      cost: 6500,
      accessories: [{ sellPriceExclGst: 400, cost: 250 }, { sellPriceExclGst: 200 }],
    },
    trailer: {
      sellPriceExclGst: 3000,
      cost: 2200,
      options: [{ sellPriceExclGst: 300 }, { sellPriceExclGst: 150 }],
    },
    dealerFit: [
      { items: [{ sellPriceExclGst: 120 }, { sellPriceExclGst: 80 }] },
      { items: [{ sellPriceExclGst: 300 }] },
    ],
    fitUpSelections: [{ quantity: 2, sellPrice: 100, cost: 60 }],
  };

  const f = buildQuoteFinancials(fullQuote);

  it('boatBasePrice = variant sell', () => expect(f.boatBasePrice).toBe(10000));
  it('optionsTotal = selected + custom', () => expect(f.optionsTotal).toBe(850));
  it('regoTotal sums all four rego components', () => expect(f.regoTotal).toBe(300));
  it('motorTotal = motor + accessories', () => expect(f.motorTotal).toBe(8600));
  it('trailerTotal = trailer + options', () => expect(f.trailerTotal).toBe(3450));
  it('dealerFitTotal sums all selections and items', () => expect(f.dealerFitTotal).toBe(500));
  it('fitUpTotal', () => expect(f.fitUpTotal).toBe(200));
  it('subtotal = sum of all sections', () => {
    expect(f.subtotalExclGst).toBe(10000 + 850 + 300 + 8600 + 3450 + 500 + 200);
    expect(f.subtotalExclGst).toBe(23900);
  });
  it('totalInclGst from subtotal (no discount)', () => {
    expect(f.totalInclGst).toBe(Math.ceil(23900 * 1.1));
    expect(f.totalInclGst).toBe(26291); // 23900*1.1 = 26290.000000000004 -> ceil 26291 (float quirk)
  });
  it('gstAmount', () => expect(f.gstAmount).toBe(26291 - 23900));

  it('empty quote -> everything zero', () => {
    const z = buildQuoteFinancials({});
    expect(z.boatBasePrice).toBe(0);
    expect(z.optionsTotal).toBe(0);
    expect(z.regoTotal).toBe(0);
    expect(z.motorTotal).toBe(0);
    expect(z.trailerTotal).toBe(0);
    expect(z.dealerFitTotal).toBe(0);
    expect(z.fitUpTotal).toBe(0);
    expect(z.subtotalExclGst).toBe(0);
    expect(z.totalInclGst).toBe(0);
    expect(z.gstAmount).toBe(0);
    expect(z.grossProfit).toBe(0);
    expect(z.marginPercent).toBe(0);
  });

  it('partial rego object sums only present fields', () => {
    const p = buildQuoteFinancials({ registration: { boatRegoPrice: 99 } });
    expect(p.regoTotal).toBe(99);
  });

  it('dealerFit selection with no items array contributes 0', () => {
    const p = buildQuoteFinancials({ dealerFit: [{}] });
    expect(p.dealerFitTotal).toBe(0);
  });

  it('motor with accessories but no sell price', () => {
    const p = buildQuoteFinancials({ motor: { accessories: [{ sellPriceExclGst: 75 }] } });
    expect(p.motorTotal).toBe(75);
  });
});

describe('buildQuoteFinancials — cost fallbacks (0.7 / 0.8 / 0.85 / 0.6 heuristics)', () => {
  it('boat cost: explicit variant.cost wins', () => {
    const f = buildQuoteFinancials({ variant: { sellPriceExclGst: 10000, cost: 6800 } });
    expect(f.boatCost).toBe(6800);
  });

  it('boat cost: missing cost falls back to 70% of sell', () => {
    const f = buildQuoteFinancials({ variant: { sellPriceExclGst: 10000 } });
    expect(f.boatCost).toBeCloseTo(7000, 10);
  });

  it('boat cost: cost of 0 is FALSY and falls back to 0.7 heuristic (|| not ??)', () => {
    // TODO-BUG? A genuine catalog cost of $0 is overridden by the 70%
    // heuristic because the fallback uses `||`. Asserting current behavior.
    const f = buildQuoteFinancials({ variant: { sellPriceExclGst: 1000, cost: 0 } });
    expect(f.boatCost).toBeCloseTo(700, 10);
  });

  it('selectedOptions cost fallback is 0.7 of sell', () => {
    const f = buildQuoteFinancials({ selectedOptions: [{ sellPriceExclGst: 100 }] });
    expect(f.optionsCost).toBeCloseTo(70, 10);
  });

  it('customOptions cost fallback is 0.8 of sell', () => {
    const f = buildQuoteFinancials({ customOptions: [{ sellPriceExclGst: 100 }] });
    expect(f.optionsCost).toBeCloseTo(80, 10);
  });

  it('mixed options: explicit costs + fallbacks combine', () => {
    const f = buildQuoteFinancials({
      selectedOptions: [{ sellPriceExclGst: 100, cost: 55 }, { sellPriceExclGst: 200 }],
      customOptions: [{ sellPriceExclGst: 50, cost: 20 }, { sellPriceExclGst: 100 }],
    });
    expect(f.optionsCost).toBeCloseTo(55 + 140 + 20 + 80, 10);
  });

  it('motor cost fallback is 0.85 of motor sell', () => {
    const f = buildQuoteFinancials({ motor: { sellPriceExclGst: 10000 } });
    expect(f.motorCost).toBeCloseTo(8500, 10);
  });

  it('motor accessory cost fallback is 0.7 of accessory sell', () => {
    const f = buildQuoteFinancials({ motor: { sellPriceExclGst: 0, accessories: [{ sellPriceExclGst: 100 }] } });
    expect(f.motorCost).toBeCloseTo(70, 10);
  });

  it('motor explicit cost wins over 0.85 heuristic', () => {
    const f = buildQuoteFinancials({ motor: { sellPriceExclGst: 10000, cost: 8100 } });
    expect(f.motorCost).toBe(8100);
  });

  it('trailer cost fallback is 0.8 of trailer sell', () => {
    const f = buildQuoteFinancials({ trailer: { sellPriceExclGst: 5000 } });
    expect(f.trailerCost).toBeCloseTo(4000, 10);
  });

  it('trailer explicit cost wins', () => {
    const f = buildQuoteFinancials({ trailer: { sellPriceExclGst: 5000, cost: 3900 } });
    expect(f.trailerCost).toBe(3900);
  });

  it('dealer fit cost is always 60% of dealer fit total (no explicit cost path)', () => {
    const f = buildQuoteFinancials({ dealerFit: [{ items: [{ sellPriceExclGst: 1000 }] }] });
    expect(f.dealerFitCost).toBeCloseTo(600, 10);
  });

  it('rego is passed through to cost at 100% (no margin on rego)', () => {
    const f = buildQuoteFinancials({ registration: { boatRegoPrice: 200, trailerRegoPrice: 100 } });
    expect(f.totalDealCostExclGst).toBe(300);
    expect(f.grossProfit).toBe(0);
  });

  it('totalDealCostExclGst sums all cost buckets + rego', () => {
    const f = buildQuoteFinancials({
      variant: { sellPriceExclGst: 10000, cost: 7000 },
      selectedOptions: [{ sellPriceExclGst: 100, cost: 60 }],
      motor: { sellPriceExclGst: 8000, cost: 6500 },
      trailer: { sellPriceExclGst: 3000, cost: 2200 },
      dealerFit: [{ items: [{ sellPriceExclGst: 500 }] }],
      fitUpSelections: [{ quantity: 1, cost: 90, sellPrice: 150 }],
      registration: { boatRegoPrice: 150 },
    });
    expect(f.totalDealCostExclGst).toBeCloseTo(7000 + 60 + 6500 + 2200 + 300 + 90 + 150, 10);
  });
});

describe('buildQuoteFinancials — margin percent', () => {
  it('grossProfit = finalTotal - totalDealCost', () => {
    const f = buildQuoteFinancials({ variant: { sellPriceExclGst: 10000, cost: 7000 } });
    expect(f.grossProfit).toBe(3000);
  });

  it('marginPercent = grossProfit / finalTotal × 100', () => {
    const f = buildQuoteFinancials({ variant: { sellPriceExclGst: 10000, cost: 7000 } });
    expect(f.marginPercent).toBeCloseTo(30, 10);
  });

  it('discount reduces margin (cost unchanged)', () => {
    const f = buildQuoteFinancials({ variant: { sellPriceExclGst: 10000, cost: 7000 } }, 1000);
    expect(f.grossProfit).toBe(2000);
    expect(f.marginPercent).toBeCloseTo((2000 / 9000) * 100, 10);
  });

  it('zero final total -> marginPercent 0 (division guard)', () => {
    const f = buildQuoteFinancials({});
    expect(f.marginPercent).toBe(0);
  });

  it('negative margin when cost exceeds sell', () => {
    const f = buildQuoteFinancials({ variant: { sellPriceExclGst: 1000, cost: 1200 } });
    expect(f.grossProfit).toBe(-200);
    expect(f.marginPercent).toBeCloseTo(-20, 10);
  });

  const marginTable: Array<[number, number, number]> = [
    // [sell, cost, expected margin %]
    [100, 70, 30],
    [100, 50, 50],
    [200, 150, 25],
    [1000, 850, 15],
    [50000, 40000, 20],
    [12345, 12345, 0],
  ];
  it.each(marginTable)('sell %d cost %d -> %d%% margin', (sell, cost, pct) => {
    const f = buildQuoteFinancials({ variant: { sellPriceExclGst: sell, cost } });
    expect(f.marginPercent).toBeCloseTo(pct, 8);
  });

  it('all-heuristic quote margin (0.7 boat only) is 30%', () => {
    const f = buildQuoteFinancials({ variant: { sellPriceExclGst: 33333 } });
    expect(f.marginPercent).toBeCloseTo(30, 8);
  });
});
