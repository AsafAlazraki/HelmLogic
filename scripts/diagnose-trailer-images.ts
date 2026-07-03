/**
 * Samples imageUrl values across seeded trailers + checks whether each URL
 * returns 200 on HEAD. Output: counts + any broken URLs + sample of working ones.
 *
 * Usage: npx tsx scripts/diagnose-trailer-images.ts
 */

const PROJECT_ID = 'studio-2290360004-3b963';
const API_KEY = 'AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const BRANDS = [
    'dunbier-haines-bmt',
    'dunbier-trailers',
    'gfab-trailers',
    'mackay-trailers',
    'redco-tinka-trailers',
    'stacer-trailers',
];

async function getAnonymousToken(): Promise<string> {
    const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) },
    );
    if (!resp.ok) throw new Error(`Auth failed: ${resp.status}`);
    return (await resp.json() as any).idToken;
}

async function fsList(token: string, path: string): Promise<any[]> {
    const resp = await fetch(`${FS_BASE}/${path}?pageSize=300`, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return [];
    return (await resp.json() as any).documents || [];
}

async function checkUrl(url: string): Promise<number> {
    try {
        const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        return resp.status;
    } catch {
        return 0;
    }
}

async function main() {
    const token = await getAnonymousToken();
    const urls: { brand: string; trailerId: string; url: string }[] = [];

    for (const brand of BRANDS) {
        const seriesList = await fsList(token, `data-warehouse/${brand}/series`);
        for (const s of seriesList) {
            const seriesId = s.name.split('/').pop();
            const trailers = await fsList(token, `data-warehouse/${brand}/series/${seriesId}/trailers`);
            for (const t of trailers) {
                const trailerId = t.name.split('/').pop();
                const imageUrl = t.fields?.imageUrl?.stringValue;
                if (imageUrl) urls.push({ brand, trailerId, url: imageUrl });
            }
        }
    }

    console.log(`Sampled ${urls.length} trailers with an imageUrl field.`);
    if (urls.length === 0) {
        console.log('\n⚠ NO trailers have an imageUrl at all — that is the bug.');
        return;
    }

    // Summarise hostnames
    const byHost = new Map<string, number>();
    for (const u of urls) {
        try {
            const h = new URL(u.url).hostname;
            byHost.set(h, (byHost.get(h) || 0) + 1);
        } catch {
            byHost.set('INVALID_URL', (byHost.get('INVALID_URL') || 0) + 1);
        }
    }
    console.log('\nHostname breakdown:');
    for (const [h, n] of [...byHost.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(4)}  ${h}`);
    }

    // Check the first 20 unique URLs
    const seen = new Set<string>();
    const unique = urls.filter(u => seen.has(u.url) ? false : (seen.add(u.url), true));
    const sample = unique.slice(0, 20);
    console.log(`\nChecking first ${sample.length} unique URLs:`);
    for (const u of sample) {
        const status = await checkUrl(u.url);
        const ok = status >= 200 && status < 400;
        console.log(`  ${ok ? '✓' : '✗'} ${status.toString().padStart(3)}  ${u.brand}/${u.trailerId}`);
        if (!ok) console.log(`       ${u.url}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });

export {};
