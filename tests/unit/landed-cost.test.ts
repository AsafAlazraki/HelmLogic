import { describe, it, expect } from 'vitest';

/**
 * Pure re-implementation check of the NSM MPF landed-cost formula used by
 * the scripts/mpf import tooling, as documented + verified in
 * tasks/mpf-audit/analysis/boat-module.md §7:
 *
 *   Landed Hull Cost =
 *     (Base Cost - Factory Discounts + factory-currency charges) / EX Rate
 *     + Other Chg $A + Road Freight (AUD)
 *
 * EX Rate is a DIVISOR (AUD per-unit rate: USD 0.7, NZ 1.2, EURO 0.6, AUD 1)
 * — same semantics as HelmLogic organisations/{orgId}/exchangeRates.
 *
 * Sell ladder (same doc, row 445 CL380):
 *   Trade = Cash × 0.95 · Sub Dealer = Cash × 0.825 · AUS Sailing = Cash × 0.80
 */
function landedCost(
  base: number,
  discounts: number,
  factoryCharges: number,
  exRate: number,
  otherAud: number,
  roadFreight: number,
): number {
  return (base - discounts + factoryCharges) / exRate + otherAud + roadFreight;
}

describe('MPF landed-cost formula — 20-case table (2dp tolerance)', () => {
  // [base, discounts, factoryCharges, exRate, otherAud, roadFreight, expected]
  // Expected values computed independently in node and hard-coded to 4dp.
  const table: Array<[number, number, number, number, number, number, number]> = [
    [4504, 0, 0, 0.7, 300, 490, 7224.2857],       // Highfield CL380 (HBC066) — verified exact in the MPF audit
    [1367, 0, 0, 1, 0, 82.49, 1449.49],           // Stacer 309 Skimma (SP309S2SP) — AUD-native, verified exact
    [5000, 0, 0, 0.7, 0, 0, 7142.8571],           // USD, bare
    [5000, 250, 0, 0.7, 0, 0, 6785.7143],         // USD with factory discount
    [5000, 0, 350, 0.7, 200, 450, 8292.8571],     // USD with factory charges + AUD adders
    [12000, 600, 150, 0.7, 300, 490, 17290.0],    // USD, full chain
    [8000, 0, 0, 1.2, 150, 300, 7116.6667],       // NZ rate 1.2
    [8000, 400, 0, 1.2, 0, 250, 6583.3333],       // NZ with discount
    [15000, 0, 900, 0.6, 500, 600, 27600.0],      // EURO rate 0.6
    [15000, 750, 0, 0.6, 0, 0, 23750.0],          // EURO with discount
    [2500, 0, 0, 1, 100, 82.49, 2682.49],         // AUD-native
    [999.99, 0, 0, 1, 0, 0, 999.99],              // AUD passthrough
    [10000, 1000, 500, 0.7, 300, 490, 14361.4286],
    [3200, 160, 80, 0.7, 120, 240, 4817.1429],
    [22000, 0, 0, 0.6, 750, 900, 38316.6667],
    [450, 0, 25, 1, 50, 60, 585.0],
    [7777.77, 77.77, 7.77, 0.7, 70, 700, 11781.1],
    [1, 0, 0, 0.7, 0, 0, 1.4286],
    [100000, 5000, 2500, 0.7, 1000, 1500, 141785.7143],
    [6500, 325, 175, 1.2, 225, 410, 5926.6667],
  ];

  it.each(table)(
    'base %d − disc %d + charges %d, /%d, +%d +%d ≈ %d',
    (base, disc, charges, ex, other, freight, expected) => {
      expect(landedCost(base, disc, charges, ex, other, freight)).toBeCloseTo(expected, 2);
    },
  );

  it('CL380 verified case rounds to 7224.29 at 2dp', () => {
    const v = landedCost(4504, 0, 0, 0.7, 300, 490);
    expect(Math.round(v * 100) / 100).toBe(7224.29);
  });

  it('Stacer verified case is exact: 1367/1 + 82.49 = 1449.49', () => {
    expect(landedCost(1367, 0, 0, 1, 0, 82.49)).toBe(1449.49);
  });

  it('EX Rate is a divisor: halving the rate doubles the factory-currency component', () => {
    const aud = landedCost(1000, 0, 0, 1, 0, 0);
    const usd = landedCost(1000, 0, 0, 0.5, 0, 0);
    expect(usd).toBeCloseTo(aud * 2, 8);
  });

  it('AUD adders are NOT divided by the exchange rate', () => {
    const withAdders = landedCost(0, 0, 0, 0.7, 300, 490);
    expect(withAdders).toBe(790); // straight sum, no /0.7
  });

  it('discount reduces landed cost 1:1 in factory currency (scaled by /exRate)', () => {
    const noDisc = landedCost(5000, 0, 0, 0.7, 100, 100);
    const withDisc = landedCost(5000, 700, 0, 0.7, 100, 100);
    expect(noDisc - withDisc).toBeCloseTo(1000, 8); // 700/0.7
  });
});

describe('MPF sell-price ladder (boat-module.md §7)', () => {
  const trade = (cash: number) => cash * 0.95;
  const subDealer = (cash: number) => cash * 0.825;
  const ausSailing = (cash: number) => cash * 0.8;

  // [cash, expected trade, expected subDealer, expected ausSailing] — 2dp
  const ladder: Array<[number, number, number, number]> = [
    [11940, 11343.0, 9850.5, 9552.0], // CL380 documented case: Trade = 11,343
    [1730, 1643.5, 1427.25, 1384.0],  // Stacer Skimma cash price
    [25000, 23750.0, 20625.0, 20000.0],
    [9999, 9499.05, 8249.17, 7999.2],
    [45450, 43177.5, 37496.25, 36360.0],
    [100000, 95000.0, 82500.0, 80000.0],
    [7947, 7549.65, 6556.27, 6357.6],
    [12345.45, 11728.18, 10185.0, 9876.36],
  ];

  it.each(ladder)('cash %d -> trade %d / subDealer %d / ausSailing %d', (cash, t, sd, aus) => {
    expect(trade(cash)).toBeCloseTo(t, 2);
    expect(subDealer(cash)).toBeCloseTo(sd, 2);
    expect(ausSailing(cash)).toBeCloseTo(aus, 2);
  });

  it('ladder ordering: cash > trade > subDealer > ausSailing for any positive cash', () => {
    for (const [cash] of ladder) {
      expect(trade(cash)).toBeLessThan(cash);
      expect(subDealer(cash)).toBeLessThan(trade(cash));
      expect(ausSailing(cash)).toBeLessThan(subDealer(cash));
      expect(ausSailing(cash)).toBeGreaterThan(0);
    }
  });

  it('ladder discounts match the Price Matrix columns: 5% trade, 17.5% sub-dealer, 20% AUS Sailing', () => {
    const cash = 10000;
    expect(cash - trade(cash)).toBeCloseTo(500, 8);
    expect(cash - subDealer(cash)).toBeCloseTo(1750, 8);
    expect(cash - ausSailing(cash)).toBeCloseTo(2000, 8);
  });

  it('CL380 sell derivation sanity: landed × (1 + HO-MU 0.5) × 1.1 GST ≈ listed 11,940 (hand-rounded)', () => {
    const landed = landedCost(4504, 0, 0, 0.7, 300, 490); // 7224.2857
    const derivedCash = landed * 1.5 * 1.1;               // ≈ 11920.07
    expect(derivedCash).toBeCloseTo(11920.07, 1);
    // NSM hand-rounds the list price; the listed 11,940 sits within $20 of the derivation.
    expect(Math.abs(11940 - derivedCash)).toBeLessThan(25);
  });
});
