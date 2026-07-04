/**
 * Hero-carousel slide navigation + image resolution (FFR-30).
 *
 * Extracted from highfield-quote-flow.tsx after Asaf's SP560 field video:
 * clicking a motor on Step 3 made the hero carousel show the REDCO
 * TRAILER image instead of the motor.
 *
 * Root cause (two compounding gaps):
 *
 *  1. Image resolution had no fallback CHAIN. `resolveImageUrl` picked
 *     the FIRST populated field (imageUrl → imageLink → 'Image Link' →
 *     SummaryImage → …) and, if that single URL was dead / SharePoint
 *     / previously marked broken, returned null WITHOUT trying the
 *     remaining candidates. A Yamaha motor whose `imageUrl` is dead but
 *     whose `SummaryImage` is fine produced NO motor slide at all.
 *
 *  2. The slide array is ordered boat → variant → build → motor →
 *     trailer → gallery. When a motor selection produced no motor slide
 *     (or a motor image died and its slide was dropped), embla's reInit
 *     keeps the current NUMERIC index — so the trailer slide (auto-
 *     assigned on mount for models with a default trailer) shifted into
 *     the index where the motor slide used to be. The scroll effect then
 *     bailed on `motorIdx === -1`, leaving the carousel parked on an
 *     unrelated slide type (the trailer brand shot).
 *
 * Fixes here, consumed by the quote flow:
 *  - resolveItemImageUrl(): tries EVERY candidate field in order and
 *    returns the first renderable URL (renderability is injected so the
 *    component's dead-URL set + SharePoint denylist keep working).
 *  - findSelectionScrollIndex(): returns the desired slide type's index
 *    if it exists, otherwise falls back through related "safe" types
 *    (variant → boat by default) and NEVER an unrelated type — so a
 *    motor pick can scroll to motor, or stay on the hull imagery, but
 *    can never land on the trailer.
 */

export interface HeroSlideLike {
    type: string;
}

/** Image-field candidates in priority order. Mirrors (and replaces) the
 *  single-pick `||` chain previously inlined in the quote flow. */
const IMAGE_FIELD_CANDIDATES = ['imageUrl', 'imageLink', 'Image Link', 'SummaryImage', 'url', 'image'] as const;

/** Normalise one raw image path the way the quote-flow hero expects:
 *  absolute http(s)/data URLs pass through, Yamaha relative asset paths
 *  (`images/products/...`) get the Yamaha CDN origin prefixed, anything
 *  else gets backslashes flattened. Returns null for non-strings/empties. */
export function normalizeImagePath(raw: unknown): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const path = raw;
    if (path.startsWith('http') || path.startsWith('data:image')) return path;
    if (path.includes('images/products') || path.includes('images/accessories')) {
        return `https://www.yamaha-motor.com.au${path.startsWith('/') ? '' : '/'}${path.trim().replace(/\\/g, '/')}`;
    }
    const out = path.trim().replace(/\\/g, '/');
    return out.length > 0 ? out : null;
}

/**
 * Resolve the best renderable image URL for a catalog item (motor,
 * accessory, …) by walking the full candidate chain — imageUrl →
 * imageLink → 'Image Link' → SummaryImage → url → image — and returning
 * the FIRST candidate that both normalises and passes the injected
 * renderability check (dead-URL set / SharePoint denylist live in the
 * component). This is what makes `SummaryImage` a real fallback instead
 * of only being consulted when `imageUrl` is entirely absent.
 */
export function resolveItemImageUrl(
    item: Record<string, unknown> | null | undefined,
    isRenderable: (url?: string | null) => boolean,
): string | null {
    if (!item) return null;
    for (const field of IMAGE_FIELD_CANDIDATES) {
        const normalized = normalizeImagePath(item[field]);
        if (normalized && isRenderable(normalized)) return normalized;
    }
    return null;
}

/**
 * Index the selection-driven auto-scroll should target.
 *
 * Returns the index of the first slide of `desiredType` when one exists;
 * otherwise falls back through `fallbackTypes` IN ORDER (default:
 * variant, then boat — i.e. "stay on the hull imagery"). Returns -1 when
 * neither the desired nor any fallback type exists, in which case the
 * caller must NOT scroll (scrolling to an arbitrary index is exactly the
 * shifted-index bug this replaces).
 */
export function findSelectionScrollIndex(
    slides: readonly HeroSlideLike[],
    desiredType: string,
    fallbackTypes: readonly string[] = ['variant', 'boat'],
): number {
    const desired = slides.findIndex(s => s.type === desiredType);
    if (desired !== -1) return desired;
    for (const fb of fallbackTypes) {
        const idx = slides.findIndex(s => s.type === fb);
        if (idx !== -1) return idx;
    }
    return -1;
}
