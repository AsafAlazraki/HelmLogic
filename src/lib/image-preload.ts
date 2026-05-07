/**
 * Image pre-loader (v1.7 round-9).
 *
 * `@react-pdf/renderer` runs inside a PDFViewer iframe and uses an
 * internal fetch to load <Image src="...">. That fetch needs CORS
 * headers from the image origin — and Firebase Storage / external
 * vendor CDNs (Yamaha, etc.) don't return CORS headers by default.
 * Result: the iframe fetch fails silently, the image renders as
 * nothing on the PDF, even though the same URL works fine in a
 * browser <img> tag (which uses no-cors mode).
 *
 * Workaround used since round-4 for the cover image: fetch the URL
 * from the parent document context (where the browser is more
 * permissive about cross-origin reads when no Authorization header
 * is sent), convert the blob to a base64 `data:` URL, hand THAT to
 * @react-pdf instead of the original URL. @react-pdf doesn't fetch
 * data URLs — it decodes them inline — so CORS is bypassed entirely.
 *
 * Round-9 generalises that pattern: every image URL in the customer
 * PDF (cover + inline content-block images + motor photo + trailer
 * photo + brand logos + salesperson photos) gets pre-loaded into a
 * URL → dataURL map BEFORE the PDF renders.
 *
 * Failures are non-fatal — if a URL can't be fetched, it stays as a
 * URL and @react-pdf will likely silent-fail on it (matches existing
 * behaviour). We log a warn so debugging is straightforward.
 */

/** Fetch one URL, decode to base64 data URL. Returns null on failure. */
export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
    if (!url) return null;
    if (url.startsWith('data:')) return url; // already a data URL — pass through
    try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) {
            console.warn('[image-preload] non-OK response:', resp.status, url);
            return null;
        }
        const blob = await resp.blob();
        return await new Promise<string | null>((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve((r.result as string) ?? null);
            r.onerror = () => {
                console.warn('[image-preload] FileReader failed for:', url);
                resolve(null);
            };
            r.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('[image-preload] fetch failed:', url, e);
        return null;
    }
}

/**
 * Preload many URLs in parallel. Returns Map<originalUrl, dataUrl>;
 * URLs that fail to fetch are absent from the result so callers can
 * fall back to the original URL.
 */
export async function preloadImages(urls: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = Array.from(new Set(urls.filter((u): u is string => !!u && u.trim().length > 0)));
    const out = new Map<string, string>();
    const results = await Promise.all(unique.map(async u => ({ url: u, data: await fetchImageAsDataUrl(u) })));
    for (const r of results) {
        if (r.data) out.set(r.url, r.data);
    }
    return out;
}

/**
 * Walk an HTML string for <img src="..."> values. Returns the list
 * of URLs found, with HTML entity decoding applied (TipTap escapes
 * `&` to `&amp;` in serialised HTML — important for Firebase Storage
 * URLs whose token query param starts after the `&`).
 */
export function extractImgUrlsFromHtml(html: string | null | undefined): string[] {
    if (!html) return [];
    const out: string[] = [];
    const re = /<img[^>]*src=(?:"([^"]+)"|'([^']+)')/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const raw = m[1] ?? m[2];
        if (!raw) continue;
        const decoded = raw
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
        out.push(decoded);
    }
    return out;
}

/**
 * Replace every <img src="X"> with <img src="<dataUrl>"> when X is
 * present in the urlMap. Leaves un-mapped URLs alone. Handles HTML
 * entity decoding the same way extractImgUrlsFromHtml does so the
 * lookup matches.
 */
export function swapImgUrlsInHtml(html: string, urlMap: Map<string, string>): string {
    if (!html) return html;
    return html.replace(
        /(<img[^>]*src=)("([^"]+)"|'([^']+)')/gi,
        (full, prefix: string, _quoted: string, dq: string | undefined, sq: string | undefined) => {
            const raw = (dq ?? sq ?? '') as string;
            const decoded = raw
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
            const dataUrl = urlMap.get(decoded);
            if (!dataUrl) return full;
            return `${prefix}"${dataUrl}"`;
        },
    );
}
