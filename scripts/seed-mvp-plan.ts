/**
 * Seed the v1.6 MVP plan into Firestore.
 *
 * Creates the 5 Epics and the 22 Feature stories from the stakeholder
 * MVP spec (`tasks/v1.6-planning-system-design.md` §6). Idempotent —
 * skips epics whose doc already exists, skips features whose title is
 * already present in the live snapshot.
 *
 * Usage:
 *   npx tsx scripts/seed-mvp-plan.ts            # dry-run — print what would happen
 *   npx tsx scripts/seed-mvp-plan.ts --live     # actually write to Firestore
 *
 * Auth: anonymous Firebase user (no organisationId, so isSubDealer() is
 * false → rules allow features+epics writes). Same pattern as
 * scripts/create-trailers-module.ts.
 */

const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');

const PROJECT_ID = 'studio-2290360004-3b963';
const API_KEY = 'AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ---------------------------------------------------------------------------
// Firestore REST helpers (cribbed from create-trailers-module.ts)
// ---------------------------------------------------------------------------

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

async function fsGet(token: string, path: string): Promise<any | null> {
    const resp = await fetch(`${FS_BASE}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status} ${await resp.text()}`);
    return resp.json();
}

async function fsList(token: string, collectionPath: string, pageSize = 200): Promise<any[]> {
    const url = `${FS_BASE}/${collectionPath}?pageSize=${pageSize}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`LIST ${collectionPath} failed: ${resp.status} ${await resp.text()}`);
    const json: any = await resp.json();
    return json.documents ?? [];
}

/** Use `documentId=` query param so we control the doc id (required for stable epic ids). */
async function fsCreate(token: string, collectionPath: string, docId: string, data: Record<string, any>): Promise<void> {
    const url = `${FS_BASE}/${collectionPath}?documentId=${encodeURIComponent(docId)}`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(toFsDoc(data)),
    });
    if (!resp.ok) throw new Error(`CREATE ${collectionPath}/${docId} failed: ${resp.status} ${await resp.text()}`);
}

/** Auto-id create — for features. Returns the resulting doc name. */
async function fsAdd(token: string, collectionPath: string, data: Record<string, any>): Promise<string> {
    const resp = await fetch(`${FS_BASE}/${collectionPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(toFsDoc(data)),
    });
    if (!resp.ok) throw new Error(`ADD ${collectionPath} failed: ${resp.status} ${await resp.text()}`);
    const json: any = await resp.json();
    return json.name as string;
}

/** Read string field from a Firestore REST doc. */
function readStr(doc: any, field: string): string | undefined {
    return doc?.fields?.[field]?.stringValue;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log(`\n=== Seed v1.6 MVP plan ${LIVE ? '(LIVE)' : '(dry-run)'} ===\n`);
    if (!LIVE) {
        console.log('Dry-run only — re-run with --live to actually write.');
    }

    // Implementation (epic + feature payloads, idempotent writes) lands
    // in the next turn — see scripts/seed-mvp-plan.payloads.ts (TODO).
    console.log('\nSkeleton in place. Payloads to be filled in next turn.\n');
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
