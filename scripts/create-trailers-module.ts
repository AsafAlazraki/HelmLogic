/**
 * Create the Trailers module document after the seed-trailers.ts importer has run.
 *
 * Usage:
 *   npx tsx scripts/create-trailers-module.ts          # dry-run print
 *   npx tsx scripts/create-trailers-module.ts --live   # PATCH to Firestore
 *
 * References the 6 live trailer brand vendor IDs (obsolete-trailers is excluded
 * from the module's `trailerBrandVendorIds` — those rows are still ingested but
 * aren't surfaced in the catalog).
 */

const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');

const PROJECT_ID = 'studio-2290360004-3b963';
const API_KEY = 'AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const MODULE_ID = 'trailers-module';

const moduleDoc = {
    moduleType: 'trailers',
    name: 'Trailers',
    description: 'Dealer trailer catalog sourced from the Northside Marine Trailer Module xlsx',
    mainVendorId: null,
    associatedVendorIds: [],
    trailerBrandVendorIds: [
        'dunbier-haines-bmt',
        'dunbier-trailers',
        'gfab-trailers',
        'mackay-trailers',
        'redco-tinka-trailers',
        'stacer-trailers',
    ],
    trailerDealerFitCategories: [],
    coverImageUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
};

function toFsVal(v: any): any {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
        if (Number.isInteger(v)) return { integerValue: String(v) };
        return { doubleValue: v };
    }
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsVal) } };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (typeof v === 'object') {
        const fields: Record<string, any> = {};
        for (const [k, val] of Object.entries(v)) {
            if (val !== undefined) fields[k] = toFsVal(val);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}

function toFsDoc(data: Record<string, any>): any {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) fields[k] = toFsVal(v);
    }
    return { fields };
}

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
    const json: any = await resp.json();
    return json.idToken;
}

async function fsPatch(token: string, path: string, data: Record<string, any>): Promise<void> {
    const maskParams = Object.keys(data)
        .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
        .join('&');
    const url = `${FS_BASE}/${path}?${maskParams}`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(toFsDoc(data)),
    });
    if (!resp.ok) throw new Error(`PATCH ${path} failed: ${resp.status} ${await resp.text()}`);
}

async function fsGet(token: string, path: string): Promise<any | null> {
    const resp = await fetch(`${FS_BASE}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status} ${await resp.text()}`);
    return resp.json();
}

async function main() {
    console.log(`Trailers module creator — ${LIVE ? 'LIVE' : 'DRY-RUN'}`);
    console.log(`\nTarget: modules/${MODULE_ID}`);
    console.log('\nPayload:');
    console.log(JSON.stringify(moduleDoc, null, 2));

    if (!LIVE) {
        console.log('\n(dry-run) No write performed. Re-run with --live to apply.');
        return;
    }

    const token = await getAnonymousToken();
    console.log(`\nAuthenticated (anonymous) — idToken obtained`);

    const existing = await fsGet(token, `modules/${MODULE_ID}`);
    if (existing) {
        console.log(`  ⚠ modules/${MODULE_ID} already exists — will merge on top`);
        // Avoid overwriting the createdAt if the doc is pre-existing.
        const { createdAt, ...rest } = moduleDoc;
        await fsPatch(token, `modules/${MODULE_ID}`, rest);
    } else {
        await fsPatch(token, `modules/${MODULE_ID}`, moduleDoc);
    }

    console.log(`\n✓ Trailers module written: modules/${MODULE_ID}`);
    console.log(`  moduleType: trailers`);
    console.log(`  trailerBrandVendorIds: ${moduleDoc.trailerBrandVendorIds.length} vendors`);
}

main().catch(err => {
    console.error('\n✗ Failed:', err.message);
    process.exit(1);
});

export {};
