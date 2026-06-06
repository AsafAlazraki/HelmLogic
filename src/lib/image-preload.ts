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

/** Per-URL preload outcome — surfaced in the diagnostic panel so the
 *  operator can see exactly which step failed for each image. */
export type ImageLoadStatus =
    | { state: 'success'; url: string; dataUrl: string; bytes: number }
    | { state: 'fetch-failed'; url: string; reason: string }
    | { state: 'cors-blocked'; url: string }
    | { state: 'decode-failed'; url: string };

/** Fetch one URL, decode to base64 data URL. Returns null on failure.
 *  Round-11: shares the direct-then-proxy fallback with the status
 *  variant so the simpler call-sites (customer PDF download, finalize
 *  snapshot) get the proxy bypass too. */
/** v1.11 follow-up — route fetches through the weserv resizing proxy
 *  when a `maxWidth` is provided. This was the missing piece that let
 *  21MB Highfield CDN cover photos land in the PDF intact: the
 *  preload pipeline fetched the *original* URL, base64'd the bytes,
 *  then ProposalPDFDocument's pdfImg() returned the data URL as-is
 *  (since it can't resize a data URL). Routing through weserv at
 *  preload time means we fetch ~100KB instead of 21MB.
 *
 *  Falls back to the original URL when no maxWidth is requested (so
 *  call sites that don't care about size — preview iframe, etc. —
 *  keep their existing behaviour).
 *
 *  Data / SharePoint URLs short-circuit before this so the wrapping
 *  only kicks in for real http(s) URLs. */
const WESERV_BLOCKED = ['yamaha-motor.com.au', 'yamaha-motor.com'];
function viaResizingProxy(url: string, maxWidth: number): string {
    if (WESERV_BLOCKED.some(d => url.includes(d))) return url;
    const noProto = url.replace(/^https?:\/\//i, '');
    return `https://images.weserv.nl/?url=${encodeURIComponent(noProto)}&w=${maxWidth}&output=jpg&q=72`;
}

export interface FetchImageOpts {
    /** When set, fetches the URL via the weserv resizing proxy so the
     *  decoded data URL is at most `maxWidth` pixels wide. */
    maxWidth?: number;
}

export async function fetchImageAsDataUrl(url: string, opts?: FetchImageOpts): Promise<string | null> {
    if (!url) return null;
    const status = await fetchImageAsDataUrlWithStatus(url, opts);
    return status.state === 'success' ? status.dataUrl : null;
}

/**
 * Same as fetchImageAsDataUrl but returns a structured ImageLoadStatus
 * so the preview's diagnostic panel can show exactly which step failed
 * for each image (cors-blocked vs fetch-failed vs decode-failed). Used
 * by the new preloadImagesWithStatus().
 *
 * v1.7 round-11 — falls back to the server-side image proxy at
 * /api/image-proxy?url=... when the direct fetch is blocked by CORS.
 * The proxy fetches server-side (no browser CORS) and re-emits the
 * bytes with permissive Access-Control-Allow-Origin so we can decode
 * them as a data URL. This is what finally bypasses Firebase Storage
 * / Yamaha CDN / SharePoint not having CORS headers configured.
 */
async function fetchImageAsDataUrlWithStatus(url: string, opts?: FetchImageOpts): Promise<ImageLoadStatus> {
    if (url.startsWith('data:')) {
        return { state: 'success', url, dataUrl: url, bytes: url.length };
    }

    /**
     * v1.7 round-12 — known-private origins that need authentication.
     * SharePoint /sites/ paths require an authenticated session that
     * neither the browser fetch nor our anonymous server-side proxy
     * can satisfy. Short-circuit with a clear message instead of
     * timing out / returning generic cors-blocked. Org admins should
     * re-host these images on Firebase Storage to make them render.
     */
    if (/sharepoint\.com\/sites\//i.test(url)) {
        return {
            state: 'fetch-failed',
            url,
            reason: 'SharePoint /sites/ path needs auth — re-host on Firebase Storage',
        };
    }

    // v1.11 follow-up — wrap the URL with the weserv resizing proxy when a
    // maxWidth was requested. Keeps the eventual data URL small so a 21MB
    // Highfield CDN cover doesn't end up embedded full-resolution in the PDF.
    const fetchUrl = opts?.maxWidth ? viaResizingProxy(url, opts.maxWidth) : url;

    // 1. Try direct fetch first (fast path for same-origin or CORS-friendly origins).
    let resp: Response | null = null;
    let directFailed = false;
    try {
        resp = await fetch(fetchUrl, { mode: 'cors' });
        if (!resp.ok) {
            // Non-OK from the direct fetch — try the proxy in case the proxy
            // can handle it (e.g. some origins return 401 to anonymous browser
            // requests but accept server-side requests).
            directFailed = true;
            resp = null;
        }
    } catch (e: any) {
        directFailed = true;
        // TypeError on a fetch is almost always CORS or network failure
        // — fall through to the proxy retry below.
    }

    // 2. CORS / direct-fetch failure: retry via the server-side proxy.
    if (!resp) {
        try {
            // Use the resized URL for the server-side proxy too — the proxy
            // streams whatever weserv returns, so this stays consistent.
            const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(fetchUrl)}`;
            resp = await fetch(proxyUrl);
            if (!resp.ok) {
                // Try to parse a structured error from the proxy.
                let proxyMsg = `proxy HTTP ${resp.status}`;
                try {
                    const j = await resp.json();
                    if (j?.error) proxyMsg = `proxy: ${j.error}${j.host ? ` (${j.host})` : ''}`;
                } catch { /* fall through */ }
                return directFailed
                    ? { state: 'cors-blocked', url }
                    : { state: 'fetch-failed', url, reason: proxyMsg };
            }
        } catch (e: any) {
            return { state: 'fetch-failed', url, reason: e?.message ?? String(e) };
        }
    }

    // 3. Decode the (direct or proxied) response into a data URL.
    try {
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.onerror = () => reject(new Error('FileReader error'));
            r.readAsDataURL(blob);
        });
        return { state: 'success', url, dataUrl, bytes: blob.size };
    } catch {
        return { state: 'decode-failed', url };
    }
}

/**
 * Preload many URLs in parallel. Returns Map<originalUrl, dataUrl>;
 * URLs that fail to fetch are absent from the result so callers can
 * fall back to the original URL.
 */
export async function preloadImages(
    urls: (string | null | undefined)[],
    opts?: FetchImageOpts,
): Promise<Map<string, string>> {
    const unique = Array.from(new Set(urls.filter((u): u is string => !!u && u.trim().length > 0)));
    const out = new Map<string, string>();
    const results = await Promise.all(unique.map(async u => ({ url: u, data: await fetchImageAsDataUrl(u, opts) })));
    for (const r of results) {
        if (r.data) out.set(r.url, r.data);
    }
    return out;
}

/**
 * Same as preloadImages but ALSO returns per-URL status objects so the
 * preview can render a diagnostic panel ("URL X failed: cors-blocked")
 * instead of silently dropping the image.
 */
export async function preloadImagesWithStatus(
    urls: (string | null | undefined)[],
): Promise<{ map: Map<string, string>; statuses: ImageLoadStatus[] }> {
    const unique = Array.from(new Set(urls.filter((u): u is string => !!u && u.trim().length > 0)));
    const statuses = await Promise.all(unique.map(u => fetchImageAsDataUrlWithStatus(u)));
    const map = new Map<string, string>();
    for (const s of statuses) {
        if (s.state === 'success') map.set(s.url, s.dataUrl);
    }
    return { map, statuses };
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
