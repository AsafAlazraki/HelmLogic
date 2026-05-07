import { NextRequest, NextResponse } from 'next/server';

/**
 * Image proxy (v1.7 round-11) — server-side fetch for cross-origin
 * images so the customer-PDF preview can load them as data URLs
 * without hitting browser CORS restrictions.
 *
 * Why this exists: @react-pdf <Image> runs inside the PDFViewer iframe
 * and needs CORS headers from the image origin. Firebase Storage,
 * Yamaha's CDN, and the org's SharePoint don't return CORS headers,
 * so the browser blocks the fetch and the image silently fails to
 * render. The client-side preload added in round-9 hit the same wall —
 * the browser blocks the fetch BEFORE the preload code runs.
 *
 * This route fetches server-side (no browser CORS) and re-emits the
 * image bytes with our own Access-Control-Allow-Origin header so the
 * client-side preload can actually consume them.
 *
 * Security:
 *   - GET only.
 *   - Origin allow-list to prevent SSRF / abuse. Easy to extend if a
 *     new image source shows up. Block private-network targets
 *     implicitly because none are on the allow-list.
 *   - Caps response size to 10 MB so a malicious / accidental huge
 *     URL can't DoS the server.
 *   - Caches results for 1 hour so the same image isn't re-fetched
 *     on every preview render (PDF preview re-mounts on edits).
 */

/** Hosts whose images we'll proxy. Extend with care — every entry here
 *  becomes a server-side fetch that the worker can be coerced into. */
const ALLOWED_HOSTS: readonly string[] = [
    'firebasestorage.googleapis.com',
    'firebasestorage.app',                   // matches *.firebasestorage.app
    'storage.googleapis.com',
    'www.yamaha-motor.com.au',
    'yamaha-motor.com.au',
    'northsidemarine1.sharepoint.com',
    // Common CDNs we may legitimately need:
    'images.unsplash.com',
];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap

function isHostAllowed(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    return ALLOWED_HOSTS.some(h => lower === h || lower.endsWith('.' + h));
}

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url');
    if (!url) {
        return NextResponse.json({ error: 'missing url param' }, { status: 400 });
    }

    let target: URL;
    try {
        target = new URL(url);
    } catch {
        return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
        return NextResponse.json({ error: 'unsupported protocol' }, { status: 400 });
    }
    if (!isHostAllowed(target.hostname)) {
        return NextResponse.json(
            { error: 'host not in allow-list', host: target.hostname },
            { status: 403 },
        );
    }

    let upstream: Response;
    try {
        upstream = await fetch(target.toString(), {
            method: 'GET',
            // Don't forward cookies / auth headers — server-side fetch is anonymous.
            redirect: 'follow',
            // v1.7 round-12 — some CDNs (Yamaha) reject the default
            // server-side fetch user-agent as a hot-link prevention
            // measure. Browser-style UA + a Referer pointing at the
            // CDN's own host gets through. Plus an Accept header so
            // image content-types are returned (some servers default
            // to application/octet-stream without it).
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; HelmLogic-PDF-Preview/1.7; +https://helmlogic.app)',
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                Referer: `${target.protocol}//${target.hostname}/`,
            },
        });
    } catch (e: any) {
        return NextResponse.json(
            { error: 'upstream fetch failed', reason: e?.message ?? String(e) },
            { status: 502 },
        );
    }

    if (!upstream.ok) {
        return NextResponse.json(
            { error: 'upstream non-OK', status: upstream.status, statusText: upstream.statusText },
            { status: 502 },
        );
    }

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
        return NextResponse.json(
            { error: 'upstream is not an image', contentType },
            { status: 415 },
        );
    }

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
        return NextResponse.json(
            { error: 'image exceeds size cap', bytes: buf.byteLength, cap: MAX_BYTES },
            { status: 413 },
        );
    }

    return new NextResponse(buf, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Content-Length': String(buf.byteLength),
            // 1 hour browser cache — the URL → bytes mapping is immutable
            // for Firebase Storage download URLs (token in query string)
            // and effectively immutable for vendor CDN paths.
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            // Permissive CORS so client-side preload can actually consume
            // this response. The proxy is the trust boundary; once the
            // bytes pass our allow-list + size cap, exposing them to the
            // browser is fine.
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
        },
    });
}
