/**
 * FFR-30 — hero-carousel slide navigation + image fallback chain.
 *
 * Field bug (Asaf's SP560 video): clicking a motor on Step 3 made the
 * hero carousel show the REDCO TRAILER image. Two gaps reproduced and
 * locked down here:
 *  1. resolveItemImageUrl must walk the WHOLE candidate chain (a dead
 *     imageUrl must not mask a good SummaryImage).
 *  2. findSelectionScrollIndex must target the motor slide when it
 *     exists, fall back to variant/boat when it doesn't, and NEVER
 *     resolve to an unrelated slide type (trailer/gallery).
 */
import { describe, it, expect } from 'vitest';
import {
    normalizeImagePath,
    resolveItemImageUrl,
    findSelectionScrollIndex,
    type HeroSlideLike,
} from '@/lib/hero-carousel';

const allRenderable = (url?: string | null) => !!url;

describe('normalizeImagePath', () => {
    it('passes through absolute http(s) and data URLs', () => {
        expect(normalizeImagePath('https://cdn.example.com/m.jpg')).toBe('https://cdn.example.com/m.jpg');
        expect(normalizeImagePath('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    });

    it('prefixes Yamaha relative asset paths with the Yamaha CDN origin', () => {
        expect(normalizeImagePath('images/products/f150.png')).toBe('https://www.yamaha-motor.com.au/images/products/f150.png');
        expect(normalizeImagePath('/images/accessories/prop.png')).toBe('https://www.yamaha-motor.com.au/images/accessories/prop.png');
    });

    it('flattens backslashes on other relative paths', () => {
        expect(normalizeImagePath('assets\\motors\\f150.png')).toBe('assets/motors/f150.png');
    });

    it('returns null for non-strings, empties and whitespace', () => {
        expect(normalizeImagePath(undefined)).toBeNull();
        expect(normalizeImagePath(null)).toBeNull();
        expect(normalizeImagePath(42)).toBeNull();
        expect(normalizeImagePath('')).toBeNull();
        expect(normalizeImagePath('   ')).toBeNull();
    });
});

describe('resolveItemImageUrl — candidate fallback chain', () => {
    it('prefers imageUrl when renderable', () => {
        const motor = { imageUrl: 'https://a/img.jpg', SummaryImage: 'https://b/img.jpg' };
        expect(resolveItemImageUrl(motor, allRenderable)).toBe('https://a/img.jpg');
    });

    it('falls back to SummaryImage when imageUrl is DEAD (the SP560 gap)', () => {
        // Old inline logic returned null here: it picked imageUrl (first
        // populated field) and never consulted SummaryImage.
        const dead = new Set(['https://a/dead.jpg']);
        const isRenderable = (u?: string | null) => !!u && !dead.has(u);
        const motor = { imageUrl: 'https://a/dead.jpg', SummaryImage: 'https://b/good.jpg' };
        expect(resolveItemImageUrl(motor, isRenderable)).toBe('https://b/good.jpg');
    });

    it('skips SharePoint-denied candidates and keeps walking the chain', () => {
        const isRenderable = (u?: string | null) => !!u && !/\.sharepoint\.com/i.test(u);
        const motor = {
            imageUrl: 'https://x.sharepoint.com/sites/doc.jpg',
            SummaryImage: 'images/products/f150.png',
        };
        expect(resolveItemImageUrl(motor, isRenderable)).toBe('https://www.yamaha-motor.com.au/images/products/f150.png');
    });

    it("uses the legacy 'Image Link' / imageLink fields in priority order", () => {
        expect(resolveItemImageUrl({ imageLink: 'https://a/1.jpg', 'Image Link': 'https://a/2.jpg' }, allRenderable)).toBe('https://a/1.jpg');
        expect(resolveItemImageUrl({ 'Image Link': 'https://a/2.jpg', url: 'https://a/3.jpg' }, allRenderable)).toBe('https://a/2.jpg');
    });

    it('returns null when NO candidate is renderable (motor gets no slide, never a broken one)', () => {
        const isRenderable = () => false;
        expect(resolveItemImageUrl({ imageUrl: 'https://a/x.jpg', SummaryImage: 'https://b/y.jpg' }, isRenderable)).toBeNull();
        expect(resolveItemImageUrl({}, allRenderable)).toBeNull();
        expect(resolveItemImageUrl(null, allRenderable)).toBeNull();
    });
});

describe('findSelectionScrollIndex — never land on an unrelated slide', () => {
    const slides = (...types: string[]): HeroSlideLike[] => types.map(type => ({ type }));

    it('targets the motor slide when one exists', () => {
        const s = slides('boat', 'variant', 'build', 'motor', 'trailer');
        expect(findSelectionScrollIndex(s, 'motor')).toBe(3);
    });

    it('SP560 regression: motor pick with no motor slide falls back to variant, NOT the trailer', () => {
        // Exact field scenario: motor slide dropped (dead image), trailer
        // auto-assigned → trailer occupies the old motor index after reInit.
        const s = slides('boat', 'variant', 'trailer', 'gallery');
        const target = findSelectionScrollIndex(s, 'motor');
        expect(target).toBe(1);
        expect(s[target].type).toBe('variant');
    });

    it('falls back to boat when no variant slide exists either', () => {
        const s = slides('boat', 'trailer', 'gallery');
        const target = findSelectionScrollIndex(s, 'motor');
        expect(target).toBe(0);
        expect(s[target].type).toBe('boat');
    });

    it('returns -1 (caller must not scroll) when neither desired nor fallback types exist', () => {
        expect(findSelectionScrollIndex(slides('trailer', 'gallery'), 'motor')).toBe(-1);
        expect(findSelectionScrollIndex([], 'motor')).toBe(-1);
    });

    it('trailer selection behaves symmetrically (trailer → variant → boat)', () => {
        expect(findSelectionScrollIndex(slides('boat', 'variant', 'motor', 'trailer'), 'trailer')).toBe(3);
        expect(findSelectionScrollIndex(slides('boat', 'variant', 'motor'), 'trailer')).toBe(1);
        expect(findSelectionScrollIndex(slides('gallery'), 'trailer')).toBe(-1);
    });

    it('never resolves to a type outside desired + fallbacks, for any slide layout', () => {
        const layouts: HeroSlideLike[][] = [
            slides('trailer'),
            slides('gallery', 'trailer'),
            slides('build', 'trailer', 'gallery'),
            slides('boat', 'variant', 'build', 'motor', 'trailer', 'gallery'),
        ];
        for (const layout of layouts) {
            const idx = findSelectionScrollIndex(layout, 'motor');
            if (idx !== -1) {
                expect(['motor', 'variant', 'boat']).toContain(layout[idx].type);
            }
        }
    });
});
