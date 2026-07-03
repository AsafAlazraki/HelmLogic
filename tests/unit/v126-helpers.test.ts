import { describe, it, expect } from 'vitest';
import {
  summariseBySource,
  orderedVariationHistory,
  canSeeMargin,
  promotionsExpiringSoon,
} from '@/lib/catalog/v126-features';
import type { Promotion } from '@/lib/catalog/promotion';

describe('summariseBySource', () => {
  it('counts customers per source', () => {
    const out = summariseBySource([
      { source: 'Walk-in' },
      { source: 'Walk-in' },
      { source: 'Boat Show' },
      { source: 'Referral' },
      { source: 'Walk-in' },
    ]);
    expect(out).toEqual({ 'Walk-in': 3, 'Boat Show': 1, Referral: 1 });
  });

  it('missing source buckets as Unknown', () => {
    expect(summariseBySource([{}, { source: undefined }])).toEqual({ Unknown: 2 });
  });

  it('empty-string source buckets as Unknown', () => {
    expect(summariseBySource([{ source: '' }])).toEqual({ Unknown: 1 });
  });

  it('whitespace-only source buckets as Unknown (trim check)', () => {
    expect(summariseBySource([{ source: '   ' }])).toEqual({ Unknown: 1 });
  });

  it('source with surrounding whitespace is trimmed into the same bucket', () => {
    // (c.source && c.source.trim()) evaluates to the TRIMMED string, so
    // ' Web ' and 'Web' share one bucket.
    const out = summariseBySource([{ source: ' Web ' }, { source: 'Web' }]);
    expect(out).toEqual({ Web: 2 });
  });

  it('empty list and null-ish list -> empty summary', () => {
    expect(summariseBySource([])).toEqual({});
    expect(summariseBySource(null as any)).toEqual({});
    expect(summariseBySource(undefined as any)).toEqual({});
  });

  it('mixed known + unknown sources', () => {
    const out = summariseBySource([{ source: 'Web' }, {}, { source: 'Web' }, { source: '' }]);
    expect(out).toEqual({ Web: 2, Unknown: 2 });
  });
});

describe('orderedVariationHistory — sort property (20 shuffles)', () => {
  /** Deterministic PRNG for stable shuffles. */
  function mulberry32(seed: number) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const shuffle = <T,>(arr: T[], rand: () => number): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const canonical = Array.from({ length: 12 }, (_, i) => ({ variationNumber: i + 1, id: `v${i + 1}` }));

  for (let s = 0; s < 20; s++) {
    it(`shuffle seed ${s}: sorts back to ascending variationNumber`, () => {
      const rand = mulberry32(s * 7919 + 3);
      const shuffled = shuffle(canonical, rand);
      const sorted = orderedVariationHistory(shuffled);
      expect(sorted.map((v) => v.variationNumber)).toEqual(canonical.map((v) => v.variationNumber));
      expect(sorted.map((v: any) => v.id)).toEqual(canonical.map((v) => v.id));
    });
  }

  it('does not mutate the input array', () => {
    const input = [{ variationNumber: 3 }, { variationNumber: 1 }, { variationNumber: 2 }];
    const snapshot = [...input];
    orderedVariationHistory(input);
    expect(input).toEqual(snapshot);
  });

  it('missing variationNumber sorts as 0 (first)', () => {
    const out = orderedVariationHistory([{ variationNumber: 2 }, {}, { variationNumber: 1 }] as any[]);
    expect(out.map((v: any) => v.variationNumber ?? 'none')).toEqual(['none', 1, 2]);
  });

  it('null-ish input returns empty array', () => {
    expect(orderedVariationHistory(null as any)).toEqual([]);
    expect(orderedVariationHistory(undefined as any)).toEqual([]);
  });

  it('is idempotent (sorting a sorted list is a no-op)', () => {
    const once = orderedVariationHistory(canonical);
    expect(orderedVariationHistory(once)).toEqual(once);
  });
});

describe('canSeeMargin — truth table', () => {
  const org = (perms: Record<string, any>) => ({ permissions: perms });

  const table: Array<[string, any, string | undefined, boolean]> = [
    // [description, organisation, roleId, expected]
    ['can_view_margin true', org({ sales: { can_view_margin: true } }), 'sales', true],
    ['can_override_margin true', org({ sales: { can_override_margin: true } }), 'sales', true],
    ['both flags true', org({ sales: { can_view_margin: true, can_override_margin: true } }), 'sales', true],
    ['both flags false', org({ sales: { can_view_margin: false, can_override_margin: false } }), 'sales', false],
    ['view true, override false', org({ sales: { can_view_margin: true, can_override_margin: false } }), 'sales', true],
    ['view false, override true', org({ sales: { can_view_margin: false, can_override_margin: true } }), 'sales', true],
    ['no flags on role', org({ sales: {} }), 'sales', false],
    ['unknown role id', org({ sales: { can_view_margin: true } }), 'admin', false],
    ['undefined roleId', org({ sales: { can_view_margin: true } }), undefined, false],
    ['empty-string roleId', org({ '': { can_view_margin: true } }), '', false], // '' is falsy -> early false
    ['null organisation', null, 'sales', false],
    ['undefined organisation', undefined, 'sales', false],
    ['organisation without permissions map', {}, 'sales', false],
    ['truthy non-boolean flag coerces true', org({ sales: { can_view_margin: 1 } }), 'sales', true],
    ['flag 0 coerces false', org({ sales: { can_view_margin: 0, can_override_margin: 0 } }), 'sales', false],
  ];

  it.each(table)('%s -> %s', (_desc, organisation, roleId, expected) => {
    expect(canSeeMargin(organisation, roleId)).toBe(expected);
  });

  it('always returns a boolean, never a truthy object', () => {
    expect(canSeeMargin(org({ sales: { can_view_margin: true } }), 'sales')).toBe(true);
    expect(typeof canSeeMargin(null, 'x')).toBe('boolean');
  });
});

describe('promotionsExpiringSoon — fixed now', () => {
  const NOW = new Date('2026-07-03T00:00:00.000Z');
  const nowMs = NOW.getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const ts = (ms: number) => ({ toDate: () => new Date(ms) });
  const secs = (ms: number) => ({ seconds: Math.floor(ms / 1000) });

  const promo = (over: Partial<Promotion> & { id: string }): Promotion => ({
    organisationId: 'o', name: over.id, form: 'percent', value: 10,
    active: true, createdAt: null, createdByUid: 'u', createdByName: 'U',
    ...over,
  } as Promotion);

  it('includes live promos ending within the default 7-day horizon', () => {
    const p = promo({ id: 'soon', endsAt: ts(nowMs + 3 * DAY) });
    expect(promotionsExpiringSoon([p], 7, NOW).map((x) => x.id)).toEqual(['soon']);
  });

  it('excludes promos ending beyond the horizon', () => {
    const p = promo({ id: 'later', endsAt: ts(nowMs + 8 * DAY) });
    expect(promotionsExpiringSoon([p], 7, NOW)).toEqual([]);
  });

  it('ending exactly AT the horizon is included (<= comparison)', () => {
    const p = promo({ id: 'edge', endsAt: ts(nowMs + 7 * DAY) });
    expect(promotionsExpiringSoon([p], 7, NOW).map((x) => x.id)).toEqual(['edge']);
  });

  it('ending 1ms past the horizon is excluded', () => {
    const p = promo({ id: 'past-edge', endsAt: ts(nowMs + 7 * DAY + 1) });
    expect(promotionsExpiringSoon([p], 7, NOW)).toEqual([]);
  });

  it('ending exactly now is still live and included', () => {
    const p = promo({ id: 'now', endsAt: ts(nowMs) });
    expect(promotionsExpiringSoon([p], 7, NOW).map((x) => x.id)).toEqual(['now']);
  });

  it('already-expired promos are excluded (not live)', () => {
    const p = promo({ id: 'expired', endsAt: ts(nowMs - DAY) });
    expect(promotionsExpiringSoon([p], 7, NOW)).toEqual([]);
  });

  it('open-ended promos (no endsAt) never expire soon', () => {
    expect(promotionsExpiringSoon([promo({ id: 'open' })], 7, NOW)).toEqual([]);
    expect(promotionsExpiringSoon([promo({ id: 'open2', endsAt: null })], 7, NOW)).toEqual([]);
  });

  it('inactive promos are excluded even when ending soon', () => {
    const p = promo({ id: 'inactive', active: false, endsAt: ts(nowMs + DAY) });
    expect(promotionsExpiringSoon([p], 7, NOW)).toEqual([]);
  });

  it('not-yet-started promos are excluded even when ending soon', () => {
    const p = promo({ id: 'future', startsAt: ts(nowMs + DAY), endsAt: ts(nowMs + 2 * DAY) });
    expect(promotionsExpiringSoon([p], 7, NOW)).toEqual([]);
  });

  it('custom withinDays widens/narrows the horizon', () => {
    const p = promo({ id: 'p', endsAt: ts(nowMs + 10 * DAY) });
    expect(promotionsExpiringSoon([p], 14, NOW).map((x) => x.id)).toEqual(['p']);
    expect(promotionsExpiringSoon([p], 7, NOW)).toEqual([]);
    const q = promo({ id: 'q', endsAt: ts(nowMs + 2 * DAY) });
    expect(promotionsExpiringSoon([q], 1, NOW)).toEqual([]);
  });

  it('serialized {seconds} timestamps work too', () => {
    const p = promo({ id: 's', endsAt: secs(nowMs + 2 * DAY) });
    expect(promotionsExpiringSoon([p], 7, NOW).map((x) => x.id)).toEqual(['s']);
  });

  it('mixed list filters correctly and preserves order', () => {
    const list = [
      promo({ id: 'a', endsAt: ts(nowMs + DAY) }),
      promo({ id: 'b', endsAt: ts(nowMs + 30 * DAY) }),
      promo({ id: 'c', endsAt: ts(nowMs + 6 * DAY) }),
      promo({ id: 'd', active: false, endsAt: ts(nowMs + DAY) }),
      promo({ id: 'e' }),
    ];
    expect(promotionsExpiringSoon(list, 7, NOW).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('null-ish promotions list tolerated', () => {
    expect(promotionsExpiringSoon(null as any, 7, NOW)).toEqual([]);
    expect(promotionsExpiringSoon(undefined as any, 7, NOW)).toEqual([]);
  });
});
