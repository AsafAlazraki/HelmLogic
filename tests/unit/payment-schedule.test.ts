import { describe, it, expect } from 'vitest';
import {
  buildPaymentSchedule,
  totalPaid,
  outstandingBalance,
  applyDepositPaid,
  type PaymentScheduleLine,
} from '@/lib/catalog/payment-schedule';
import { customerOutstanding } from '@/lib/catalog/v126-features';

describe('buildPaymentSchedule — line construction', () => {
  it('deposit + one milestone + final, exact reconciliation', () => {
    // 104451: dep 10% = round(10445.1) = 10445, milestone 40% = round(41780.4) = 41780,
    // final = 104451 - 52225 = 52226 (verified in node)
    const lines = buildPaymentSchedule(104451, {
      depositPercent: 10,
      paymentMilestones: [{ label: 'Hull arrival', percentage: 40 }],
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ key: 'deposit', label: 'Deposit', percentage: 10, amountIncGst: 10445, paid: false });
    expect(lines[1]).toMatchObject({ key: 'milestone-0', label: 'Hull arrival', percentage: 40, amountIncGst: 41780, paid: false });
    expect(lines[2]).toMatchObject({ key: 'final', label: 'Balance on delivery', percentage: 50, amountIncGst: 52226, paid: false });
  });

  it('deposit percent defaults to 10 when unset', () => {
    const lines = buildPaymentSchedule(10000, {});
    expect(lines).toHaveLength(2);
    expect(lines[0].percentage).toBe(10);
    expect(lines[0].amountIncGst).toBe(1000);
    expect(lines[1]).toMatchObject({ key: 'final', percentage: 90, amountIncGst: 9000 });
  });

  it('final percentage defaults to the 100% remainder', () => {
    const lines = buildPaymentSchedule(33333, { depositPercent: 30 });
    expect(lines[0].amountIncGst).toBe(10000); // round(9999.9)
    expect(lines[1].percentage).toBe(70);
    expect(lines[1].amountIncGst).toBe(23333);
  });

  it('explicit finalPercent is used verbatim (amount still carries the remainder)', () => {
    const lines = buildPaymentSchedule(10000, { depositPercent: 20, finalPercent: 75 });
    expect(lines[1].percentage).toBe(75); // label pct, NOT recomputed
    expect(lines[1].amountIncGst).toBe(8000); // remainder, not 75% of total
  });

  it('multiple milestones, each rounded independently', () => {
    // 26290: dep 2629, 30% = 7887 each, final = 26290 - 18403 = 7887 (verified)
    const lines = buildPaymentSchedule(26290, {
      depositPercent: 10,
      paymentMilestones: [
        { label: 'Order confirmed', percentage: 30 },
        { label: 'Fit-up complete', percentage: 30 },
      ],
    });
    expect(lines.map((l) => l.amountIncGst)).toEqual([2629, 7887, 7887, 7887]);
    expect(lines.map((l) => l.key)).toEqual(['deposit', 'milestone-0', 'milestone-1', 'final']);
    expect(lines[1].label).toBe('Order confirmed');
    expect(lines[2].label).toBe('Fit-up complete');
  });

  it('percentages over 100 tolerated — final line clamps at 0, never negative (FFR-8 fix)', () => {
    // FFR-8: the final remainder line is clamped at 0 so over-allocated
    // defaults (80% + 50%) can never produce a negative schedule line.
    const lines = buildPaymentSchedule(10000, {
      depositPercent: 80,
      paymentMilestones: [{ label: 'M', percentage: 50 }],
    });
    expect(lines.map((l) => l.amountIncGst)).toEqual([8000, 5000, 0]);
    expect(lines[2].percentage).toBe(0); // Math.max(0, 100-130)
    expect(lines.every((l) => l.amountIncGst >= 0)).toBe(true);
  });

  it('FFR-8 edge: allocation of exactly 100% leaves a zero (not negative) final line', () => {
    const lines = buildPaymentSchedule(10000, {
      depositPercent: 60,
      paymentMilestones: [{ label: 'M', percentage: 40 }],
    });
    expect(lines.map((l) => l.amountIncGst)).toEqual([6000, 4000, 0]);
    expect(lines[2].percentage).toBe(0);
  });

  it('FFR-8 edge: extreme over-allocation (deposit 200%) still clamps final at 0', () => {
    const lines = buildPaymentSchedule(5000, { depositPercent: 200 });
    expect(lines.map((l) => l.amountIncGst)).toEqual([10000, 0]);
    expect(lines.every((l) => l.amountIncGst >= 0)).toBe(true);
  });

  it('FFR-8 edge: under-allocated schedules still reconcile exactly (clamp is inert)', () => {
    const lines = buildPaymentSchedule(104451, {
      depositPercent: 10,
      paymentMilestones: [{ label: 'Hull arrival', percentage: 40 }],
    });
    expect(lines.reduce((a, l) => a + l.amountIncGst, 0)).toBe(104451);
    expect(lines[2].amountIncGst).toBe(52226);
  });

  it('all schedules reconcile exactly to the total (property over odd totals)', () => {
    const totals = [1, 3, 7, 99, 101, 999, 12345, 26290, 104451, 1000001, 33333, 7777];
    for (const t of totals) {
      const lines = buildPaymentSchedule(t, { depositPercent: 15, paymentMilestones: [{ label: 'a', percentage: 33 }, { label: 'b', percentage: 19 }] });
      expect(lines.reduce((a, l) => a + l.amountIncGst, 0)).toBe(t);
    }
  });

  it('non-finite total treated as 0', () => {
    const nan = buildPaymentSchedule(NaN, {});
    expect(nan.map((l) => l.amountIncGst)).toEqual([0, 0]);
    const inf = buildPaymentSchedule(Infinity, {});
    expect(inf.map((l) => l.amountIncGst)).toEqual([0, 0]);
  });

  it('zero total produces all-zero lines', () => {
    const lines = buildPaymentSchedule(0, { depositPercent: 30, paymentMilestones: [{ label: 'm', percentage: 20 }] });
    expect(lines.map((l) => l.amountIncGst)).toEqual([0, 0, 0]);
  });

  it('every line starts unpaid', () => {
    const lines = buildPaymentSchedule(50000, { depositPercent: 10, paymentMilestones: [{ label: 'm', percentage: 40 }] });
    expect(lines.every((l) => l.paid === false)).toBe(true);
  });
});

describe('totalPaid / outstandingBalance — paid/unpaid line combinations', () => {
  const line = (key: string, amount: number, paid: boolean): PaymentScheduleLine => ({
    key, label: key, percentage: 0, amountIncGst: amount, paid,
  });

  it('nothing paid -> totalPaid 0, outstanding = full total', () => {
    const lines = [line('deposit', 1000, false), line('m0', 4000, false), line('final', 5000, false)];
    expect(totalPaid(lines)).toBe(0);
    expect(outstandingBalance(lines)).toBe(10000);
  });

  it('deposit paid only', () => {
    const lines = [line('deposit', 1000, true), line('m0', 4000, false), line('final', 5000, false)];
    expect(totalPaid(lines)).toBe(1000);
    expect(outstandingBalance(lines)).toBe(9000);
  });

  it('deposit + milestone paid', () => {
    const lines = [line('deposit', 1000, true), line('m0', 4000, true), line('final', 5000, false)];
    expect(totalPaid(lines)).toBe(5000);
    expect(outstandingBalance(lines)).toBe(5000);
  });

  it('everything paid -> outstanding 0', () => {
    const lines = [line('deposit', 1000, true), line('m0', 4000, true), line('final', 5000, true)];
    expect(totalPaid(lines)).toBe(10000);
    expect(outstandingBalance(lines)).toBe(0);
  });

  it('non-contiguous paid lines (final paid before milestone)', () => {
    const lines = [line('deposit', 1000, true), line('m0', 4000, false), line('final', 5000, true)];
    expect(totalPaid(lines)).toBe(6000);
    expect(outstandingBalance(lines)).toBe(4000);
  });

  it('paid + outstanding always equals the schedule total (all 8 paid-flag combos)', () => {
    for (let mask = 0; mask < 8; mask++) {
      const lines = [
        line('deposit', 1234, !!(mask & 1)),
        line('m0', 5678, !!(mask & 2)),
        line('final', 3088, !!(mask & 4)),
      ];
      expect(totalPaid(lines) + outstandingBalance(lines)).toBe(10000);
    }
  });

  it('empty / null-ish schedules', () => {
    expect(totalPaid([])).toBe(0);
    expect(outstandingBalance([])).toBe(0);
    expect(totalPaid(null as any)).toBe(0);
    expect(outstandingBalance(null as any)).toBe(0);
  });

  it('negative reconciliation line reduces outstanding', () => {
    const lines = [line('deposit', 8000, true), line('m0', 5000, false), line('final', -3000, false)];
    expect(outstandingBalance(lines)).toBe(2000);
  });
});

describe('applyDepositPaid', () => {
  const build = () => buildPaymentSchedule(10000, { depositPercent: 10, paymentMilestones: [{ label: 'm', percentage: 40 }] });

  it('marks only the deposit line paid', () => {
    const out = applyDepositPaid(build(), { seconds: 1750000000 });
    expect(out[0].paid).toBe(true);
    expect(out[0].paidAt).toEqual({ seconds: 1750000000 });
    expect(out[1].paid).toBe(false);
    expect(out[2].paid).toBe(false);
  });

  it('missing paidAt is stored as null', () => {
    const out = applyDepositPaid(build());
    expect(out[0].paid).toBe(true);
    expect(out[0].paidAt).toBeNull();
  });

  it('does not mutate the input array', () => {
    const input = build();
    const out = applyDepositPaid(input, 'ts');
    expect(input[0].paid).toBe(false);
    expect(out).not.toBe(input);
    expect(out[0]).not.toBe(input[0]);
  });

  it('outstanding drops by the deposit amount after applyDepositPaid', () => {
    const before = build();
    const after = applyDepositPaid(before);
    expect(outstandingBalance(before)).toBe(10000);
    expect(outstandingBalance(after)).toBe(9000);
    expect(totalPaid(after)).toBe(1000);
  });
});

describe('customerOutstanding — across contracts (v1.26, 2.4.4)', () => {
  it('sums outstanding across multiple contracts', () => {
    const a = applyDepositPaid(buildPaymentSchedule(10000, {})); // 9000 outstanding
    const b = buildPaymentSchedule(5000, {});                    // 5000 outstanding
    expect(customerOutstanding({ c1: a, c2: b })).toBe(14000);
  });

  it('empty map -> 0', () => {
    expect(customerOutstanding({})).toBe(0);
    expect(customerOutstanding(null as any)).toBe(0);
  });
});
