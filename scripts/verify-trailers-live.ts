/**
 * Verifies trailers seed landed correctly by hitting Firestore REST with
 * anonymous auth and counting docs per brand/series.
 *
 * Usage: npx tsx scripts/verify-trailers-live.ts
 */

const PROJECT_ID = 'studio-2290360004-3b963';
const API_KEY = 'AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const BRANDS = [
    'dunbier-haines-bmt',
    'dunbier-trailers',
    'gfab-trailers',
    'mackay-trailers',
    'obsolete-trailers',
    'redco-tinka-trailers',
    'stacer-trailers',
];

async function getAnonymousToken(): Promise<string> {
    const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnSecureToken: true }),
        },
    );
    if (!resp.ok) throw new Error(`Auth failed: ${resp.status} ${await resp.text()}`);
    return (await resp.json() as any).idToken;
}

async function fsGet(token: string, path: string): Promise<any | null> {
    const resp = await fetch(`${FS_BASE}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status}`);
    return resp.json();
}

async function fsListCollection(token: string, path: string, pageSize = 300): Promise<any[]> {
    const url = `${FS_BASE}/${path}?pageSize=${pageSize}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`LIST ${path} failed: ${resp.status}`);
    const json: any = await resp.json();
    return json.documents || [];
}

async function main() {
    const token = await getAnonymousToken();
    console.log('Authenticated (anonymous).\n');

    // 1. Module doc
    const mod = await fsGet(token, 'modules/trailers-module');
    if (mod) {
        const f = mod.fields || {};
        console.log('✓ modules/trailers-module exists');
        console.log(`    name:        ${f.name?.stringValue}`);
        console.log(`    moduleType:  ${f.moduleType?.stringValue}`);
        const brandIds = (f.trailerBrandVendorIds?.arrayValue?.values || []).map((v: any) => v.stringValue);
        console.log(`    brandIds:    [${brandIds.join(', ')}]`);
    } else {
        console.log('✗ modules/trailers-module NOT FOUND');
    }

    console.log('\nBrand / series / trailer counts:');
    let grandTotal = 0;
    for (const brandId of BRANDS) {
        const brand = await fsGet(token, `data-warehouse/${brandId}`);
        if (!brand) {
            console.log(`  ✗ ${brandId}: vendor doc missing`);
            continue;
        }
        const brandName = brand.fields?.name?.stringValue || brandId;
        const series = await fsListCollection(token, `data-warehouse/${brandId}/series`);
        let trailerCount = 0;
        for (const s of series) {
            const sid = s.name.split('/').pop();
            const trailers = await fsListCollection(token, `data-warehouse/${brandId}/series/${sid}/trailers`);
            trailerCount += trailers.length;
        }
        grandTotal += trailerCount;
        console.log(`  ✓ ${brandName} (${brandId}): ${series.length} series, ${trailerCount} trailers`);
    }
    console.log(`\nTotal trailers in Firestore: ${grandTotal}`);
}

main().catch(err => {
    console.error('✗', err.message);
    process.exit(1);
});

export {};
