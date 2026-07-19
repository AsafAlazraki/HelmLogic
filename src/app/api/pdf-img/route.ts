import { NextRequest, NextResponse } from 'next/server';

/**
 * v1.34 — same-origin image proxy for browser-rendered PDFs.
 *
 * @react-pdf renders in the BROWSER, so every embedded image is a
 * client-side fetch. Firebase Storage tokened URLs send no CORS headers
 * (verified 2026-07-19), and the weserv proxy 404s them — so every
 * Storage-hosted image (uploaded motor photos, the mpf-mirror set,
 * vendor logos) silently failed in PDFs. This route streams the bytes
 * same-origin, which needs no CORS at all.
 *
 * SSRF guard: ONLY Firebase Storage hosts for THIS project's buckets
 * are proxied. Everything else 403s — external CDNs keep going through
 * weserv (which handles its own CORS) or are blocked by design.
 */
const ALLOWED_HOSTS = [
    'firebasestorage.googleapis.com',
    'studio-2290360004-3b963.firebasestorage.app',
];

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url');
    if (!url) return new NextResponse('missing url', { status: 400 });
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return new NextResponse('bad url', { status: 400 });
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
        return new NextResponse('host not allowed', { status: 403 });
    }
    try {
        const upstream = await fetch(parsed.toString(), { cache: 'no-store' });
        if (!upstream.ok) return new NextResponse('upstream error', { status: upstream.status });
        const buf = await upstream.arrayBuffer();
        return new NextResponse(buf, {
            status: 200,
            headers: {
                'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
                // Immutable-ish: tokened Storage URLs change when content does.
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (err) {
        console.error('[pdf-img] proxy fetch failed', err);
        return new NextResponse('fetch failed', { status: 502 });
    }
}
