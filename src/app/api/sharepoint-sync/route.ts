/**
 * SharePoint Sync API route (v1.9 — story 1.3.3).
 *
 * Server-side Microsoft Graph proxy. Client renders the PDF locally
 * (existing `renderQuotePdf()` flow) then POSTs the blob plus
 * non-secret config (tenantId / clientId / siteId / folderPath /
 * relativePath / fileName) here. This route:
 *
 *   1. Validates the env secret + payload
 *   2. Gets a client-credentials OAuth token against the org's tenant
 *   3. Resolves the SharePoint site's default drive
 *   4. Walks the folder hierarchy, creating any missing segments
 *   5. PUTs the PDF content (overwriting any existing file at the path)
 *   6. Returns the resulting webUrl + Graph item id + fullPath
 *
 * Auth gate (v1.9 known limitation): the route currently trusts the
 * calling client. Risk is low — tenant IDs and client IDs are public
 * identifiers, and only requests that match an actually-consented
 * tenant + valid secret will succeed at Graph. v1.10 should add a
 * Firebase ID-token verification (via firebase-admin) to fence the
 * route to signed-in HelmLogic users. Documented in
 * `tasks/ADMIN_TASK_sharepoint-setup.md` under the Architecture
 * section.
 *
 * Runtime: Node (not Edge) — needs full fetch + ArrayBuffer + longer
 * timeouts than the Edge runtime gives us.
 */

import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
/** Cap at 30s per request — Graph PUT of a small PDF is typically <2s,
 *  but token + drive + folder-walk + upload can chain. */
export const maxDuration = 30;

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/** Helper: encode a Graph path segment-by-segment so '/' separates
 *  segments and other special chars are URL-encoded. Graph accepts
 *  spaces, parens, dashes raw, so percent-encoding only on real
 *  reserved chars matters; encodeURIComponent then un-escape '/' is
 *  the simplest correct rendering. */
function encodeGraphPath(p: string): string {
    return encodeURIComponent(p).replace(/%2F/g, '/');
}

interface SyncPayload {
    tenantId: string;
    clientId: string;
    siteId: string;
    folderPath: string;      // root under the site's drive, e.g. "HelmLogic"
    relativePath: string;    // additional segments built per quote
    fileName: string;        // e.g. "Quote.pdf"
}

function isValidPayload(x: any): x is SyncPayload {
    return x
        && typeof x.tenantId === 'string' && x.tenantId.length > 0
        && typeof x.clientId === 'string' && x.clientId.length > 0
        && typeof x.siteId === 'string' && x.siteId.length > 0
        && typeof x.folderPath === 'string' && x.folderPath.length > 0
        && typeof x.relativePath === 'string' && x.relativePath.length > 0
        && typeof x.fileName === 'string' && x.fileName.length > 0;
}

export async function POST(req: NextRequest) {
    const secret = process.env.SHAREPOINT_CLIENT_SECRET;
    if (!secret) {
        return NextResponse.json(
            { error: 'server-not-configured', detail: 'SHAREPOINT_CLIENT_SECRET env var is missing' },
            { status: 503 },
        );
    }

    let form: FormData;
    try {
        form = await req.formData();
    } catch (e: any) {
        return NextResponse.json({ error: 'invalid-multipart', detail: e?.message }, { status: 400 });
    }

    const file = form.get('file');
    const payloadRaw = form.get('payload');
    if (!(file instanceof Blob)) {
        return NextResponse.json({ error: 'missing-file' }, { status: 400 });
    }
    if (typeof payloadRaw !== 'string') {
        return NextResponse.json({ error: 'missing-payload' }, { status: 400 });
    }

    let payload: any;
    try {
        payload = JSON.parse(payloadRaw);
    } catch {
        return NextResponse.json({ error: 'invalid-payload-json' }, { status: 400 });
    }
    if (!isValidPayload(payload)) {
        return NextResponse.json({ error: 'invalid-payload-fields' }, { status: 400 });
    }
    const { tenantId, clientId, siteId, folderPath, relativePath, fileName } = payload;

    // 1. OAuth client-credentials against the org's tenant.
    const tokenResp = await fetch(
        `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: secret,
                scope: 'https://graph.microsoft.com/.default',
            }),
        },
    );
    if (!tokenResp.ok) {
        const detail = await tokenResp.text();
        console.error('[sharepoint-sync] OAuth failed', tokenResp.status, detail);
        return NextResponse.json(
            { error: 'oauth-failed', status: tokenResp.status, detail },
            { status: 502 },
        );
    }
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson?.access_token;
    if (!accessToken) {
        return NextResponse.json({ error: 'oauth-no-token', detail: tokenJson }, { status: 502 });
    }
    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    // 2. Resolve the site's default drive.
    const driveResp = await fetch(`${GRAPH_BASE}/sites/${encodeURIComponent(siteId)}/drive`, {
        headers: authHeaders,
    });
    if (!driveResp.ok) {
        const detail = await driveResp.text();
        console.error('[sharepoint-sync] drive lookup failed', driveResp.status, detail);
        return NextResponse.json(
            { error: 'drive-lookup-failed', status: driveResp.status, detail },
            { status: 502 },
        );
    }
    const drive = await driveResp.json();
    const driveId = drive?.id;
    if (!driveId) {
        return NextResponse.json({ error: 'drive-id-missing', detail: drive }, { status: 502 });
    }

    // 3. Ensure folder hierarchy. Idempotent — GET each segment, POST
    // a folder if 404. Suppress 409 (race on concurrent creates).
    const allSegments = [...folderPath.split('/'), ...relativePath.split('/')]
        .map(s => s.trim())
        .filter(s => s.length > 0);

    let accPath = '';
    for (const segment of allSegments) {
        const childPath = accPath ? `${accPath}/${segment}` : segment;
        const getUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${encodeGraphPath(childPath)}`;
        const getResp = await fetch(getUrl, { headers: authHeaders });
        if (getResp.status === 404) {
            const createUrl = accPath
                ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodeGraphPath(accPath)}:/children`
                : `${GRAPH_BASE}/drives/${driveId}/root/children`;
            const createResp = await fetch(createUrl, {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: segment,
                    folder: {},
                    '@microsoft.graph.conflictBehavior': 'fail',
                }),
            });
            if (!createResp.ok && createResp.status !== 409) {
                const detail = await createResp.text();
                console.error('[sharepoint-sync] folder create failed', segment, createResp.status, detail);
                return NextResponse.json(
                    { error: 'folder-create-failed', segment, status: createResp.status, detail },
                    { status: 502 },
                );
            }
        } else if (!getResp.ok) {
            const detail = await getResp.text();
            console.error('[sharepoint-sync] folder GET failed', segment, getResp.status, detail);
            return NextResponse.json(
                { error: 'folder-check-failed', segment, status: getResp.status, detail },
                { status: 502 },
            );
        }
        accPath = childPath;
    }

    // 4. Upload the PDF. `conflictBehavior=replace` so re-syncs over-
    // write the previous file at the same path (idempotent at the
    // file level — a customer who gets re-finalized after a fix
    // sees the latest PDF, not stale).
    const filePath = `${accPath}/${fileName}`;
    const uploadUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${encodeGraphPath(filePath)}:/content?@microsoft.graph.conflictBehavior=replace`;
    const buf = await file.arrayBuffer();
    const uploadResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/pdf' },
        body: buf,
    });
    if (!uploadResp.ok) {
        const detail = await uploadResp.text();
        console.error('[sharepoint-sync] upload failed', uploadResp.status, detail);
        return NextResponse.json(
            { error: 'upload-failed', status: uploadResp.status, detail },
            { status: 502 },
        );
    }
    const uploaded = await uploadResp.json();

    return NextResponse.json({
        ok: true,
        webUrl: uploaded?.webUrl ?? null,
        itemId: uploaded?.id ?? null,
        fullPath: filePath,
    });
}
