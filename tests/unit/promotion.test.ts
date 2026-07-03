import { describe, it, expect } from 'vitest';
import {
  promotionDiscount,
  isPromotionLive,
  PROMOTION_FORM_LABEL,
  type Promotion,
  type PromotionForm,
} from '@/lib/catalog/promotion';

/** Firestore-Timestamp-like stub with a toDate(). */
const ts = (ms: number) => ({ toDate: () => new Date(ms) });
/** Firestore-Timestamp-like stub with only .seconds (serialized shape). */
const secs = (ms: number) => ({ seconds: Math.floor(ms / 1000) });

const basePromo = (over: Partial<Promotion>): Promotion => ({
  id: 'p1',
  organisationId: 'org1',
  name: 'Test promo',
  form: 'percent',
  value: 10,
  active: true,
  createdAt: null,
  createdByUid: 'u1',
  createdByName: 'Tester',
  ...over,
});

describe('promotionDiscount — percent form (Math.round of sub × pct/100)', () => {
  // [subtotal, pct, expected] — expected values verified against node.
  const table: Array<[number, number, number]> = [
    [1000, 10, 100],
    [1000, 12.5, 125],
    [999, 12.5, 125],   // 124.875 rounds up
    [105, 10, 11],      // 10.5 rounds half-up
    [5, 10, 1],         // 0.5 rounds up to 1
    [33, 15, 5],        // 4.95 -> 5
    [7224.29, 5, 361],  // 361.2145 -> 361
    [100, 33.333, 33],
    [1, 50, 1],         // 0.5 -> 1
    [3, 33, 1],         // 0.99 -> 1
    [999.99, 10, 100],
    [10000, 7.5, 750],
    [12345, 2.5, 309],  // 308.625 -> 309
    [50, 1, 1],         // 0.5 -> 1
    [1000, 0.05, 1],    // 0.5 -> 1
    [1000, 0, 0],
    [1000, 100, 1000],
    [0, 50, 0],
  ];
  it.each(table)('%d at %d%% -> %d', (sub, pct, expected) => {
    expect(promotionDiscount({ form: 'percent', value: pct }, sub)).toBe(expected);
  });

  it('percent above 100 clamps to 100 (full subtotal)', () => {
    expect(promotionDiscount({ form: 'percent', value: 150 }, 1000)).toBe(1000);
    expect(promotionDiscount({ form: 'percent', value: 100.01 }, 500)).toBe(500);
  });

  it('negative percent clamps to 0', () => {
    expect(promotionDiscount({ form: 'percent', value: -10 }, 1000)).toBe(0);
  });

  it('non-finite subtotal treated as 0', () => {
    expect(promotionDiscount({ form: 'percent', value: 10 }, NaN)).toBe(0);
    expect(promotionDiscount({ form: 'percent', value: 10 }, Infinity)).toBe(0);
    expect(promotionDiscount({ form: 'percent', value: 10 }, -Infinity)).toBe(0);
  });

  it('always returns an integer for percent form', () => {
    for (const sub of [0.01, 33.33, 999.99, 12345.67]) {
      expect(Number.isInteger(promotionDiscount({ form: 'percent', value: 7 }, sub))).toBe(true);
    }
  });
});

describe('promotionDiscount — fixed form (clamped to [0, subtotal])', () => {
  const table: Array<[number, number, number]> = [
    // [subtotal, value, expected]
    [1000, 100, 100],
    [1000, 1000, 1000],
    [1000, 1500, 1000],   // capped at subtotal
    [1000, 0, 0],
    [1000, -50, 0],       // negative clamps to 0
    [0, 500, 0],
    [99.5, 100, 99.5],    // cap preserves fractional subtotal
    [500, 250.75, 250.75], // fixed value NOT rounded
  ];
  it.each(table)('sub %d, fixed %d -> %d', (sub, value, expected) => {
    expect(promotionDiscount({ form: 'fixed', value }, sub)).toBe(expected);
  });

  it('non-finite subtotal treated as 0', () => {
    expect(promotionDiscount({ form: 'fixed', value: 100 }, NaN)).toBe(0);
  });

  it('negative subtotal caps discount at the (negative) subtotal but floors at 0', () => {
    // min(-100, 50) = -100, max(0, -100) = 0
    expect(promotionDiscount({ form: 'fixed', value: 50 }, -100)).toBe(0);
  });
});

describe('promotionDiscount — descriptive forms return 0', () => {
  it.each([['free-item'], ['bundle']] as Array<[PromotionForm]>)('%s form -> 0', (form) => {
    expect(promotionDiscount({ form, value: 500 }, 10000)).toBe(0);
    expect(promotionDiscount({ form, value: 0 }, 10000)).toBe(0);
  });
});

describe('PROMOTION_FORM_LABEL', () => {
  it('labels all four forms', () => {
    expect(PROMOTION_FORM_LABEL['percent']).toBe('% off');
    expect(PROMOTION_FORM_LABEL['fixed']).toBe('$ off');
    expect(PROMOTION_FORM_LABEL['free-item']).toBe('Free item');
    expect(PROMOTION_FORM_LABEL['bundle']).toBe('Bundle deal');
    expect(Object.keys(PROMOTION_FORM_LABEL)).toHaveLength(4);
  });
});

describe('isPromotionLive — date windows', () => {
  const NOW = new Date('2026-07-03T10:00:00.000Z');
  const nowMs = NOW.getTime();
  const DAY = 24 * 60 * 60 * 1000;

  it('inactive promo is never live regardless of window', () => {
    expect(isPromotionLive(basePromo({ active: false }), NOW)).toBe(false);
    expect(
      isPromotionLive(
        basePromo({ active: false, startsAt: ts(nowMs - DAY), endsAt: ts(nowMs + DAY) }),
        NOW,
      ),
    ).toBe(false);
  });

  it('active with no dates at all is live (open window)', () => {
    expect(isPromotionLive(basePromo({}), NOW)).toBe(true);
    expect(isPromotionLive(basePromo({ startsAt: null, endsAt: null }), NOW)).toBe(true);
  });

  it('live inside a toDate()-style window', () => {
    expect(
      isPromotionLive(basePromo({ startsAt: ts(nowMs - DAY), endsAt: ts(nowMs + DAY) }), NOW),
    ).toBe(true);
  });

  it('live inside a {seconds}-style (serialized) window', () => {
    expect(
      isPromotionLive(basePromo({ startsAt: secs(nowMs - DAY), endsAt: secs(nowMs + DAY) }), NOW),
    ).toBe(true);
  });

  it('not live before start', () => {
    expect(isPromotionLive(basePromo({ startsAt: ts(nowMs + DAY) }), NOW)).toBe(false);
    expect(isPromotionLive(basePromo({ startsAt: secs(nowMs + DAY) }), NOW)).toBe(false);
  });

  it('not live after end', () => {
    expect(isPromotionLive(basePromo({ endsAt: ts(nowMs - DAY) }), NOW)).toBe(false);
    expect(isPromotionLive(basePromo({ endsAt: secs(nowMs - DAY) }), NOW)).toBe(false);
  });

  it('live exactly at the start instant (strict < comparison)', () => {
    expect(isPromotionLive(basePromo({ startsAt: ts(nowMs) }), NOW)).toBe(true);
  });

  it('live exactly at the end instant (strict > comparison)', () => {
    expect(isPromotionLive(basePromo({ endsAt: ts(nowMs) }), NOW)).toBe(true);
  });

  it('one millisecond past end is not live', () => {
    expect(isPromotionLive(basePromo({ endsAt: ts(nowMs - 1) }), NOW)).toBe(false);
  });

  it('one millisecond before start is not live', () => {
    expect(isPromotionLive(basePromo({ startsAt: ts(nowMs + 1) }), NOW)).toBe(false);
  });

  it('open-ended promo (start only, in the past) is live', () => {
    expect(isPromotionLive(basePromo({ startsAt: ts(nowMs - 30 * DAY), endsAt: null }), NOW)).toBe(true);
  });

  it('end-only promo in the future is live', () => {
    expect(isPromotionLive(basePromo({ endsAt: ts(nowMs + 30 * DAY) }), NOW)).toBe(true);
  });

  it('toDate() takes precedence over a bogus seconds value on the same object', () => {
    const both = { toDate: () => new Date(nowMs - DAY), seconds: Math.floor((nowMs + 10 * DAY) / 1000) };
    // start resolved via toDate (past) -> live
    expect(isPromotionLive(basePromo({ startsAt: both }), NOW)).toBe(true);
  });

  it('window entirely in the past is not live even when active', () => {
    expect(
      isPromotionLive(basePromo({ startsAt: ts(nowMs - 10 * DAY), endsAt: ts(nowMs - 5 * DAY) }), NOW),
    ).toBe(false);
  });

  it('window entirely in the future is not live', () => {
    expect(
      isPromotionLive(basePromo({ startsAt: ts(nowMs + 5 * DAY), endsAt: ts(nowMs + 10 * DAY) }), NOW),
    ).toBe(false);
  });
});
