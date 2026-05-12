/**
 * SharePoint sync orchestrator — client-side (v1.9 — story 1.3.3).
 *
 * Single entry point fired from every HL event that should mirror a
 * PDF into SharePoint:
 *   - finalize-quote-dialog.tsx (finalize)
 *   - email-send.ts (send — runs after auto-lock + lifecycle-Sent)
 *   - quote-scenarios.ts (scenario create)
 *   - quote-lock.ts forkLockedQuote (fork-on-edit)
 *   - proposal-view.tsx handleLifecycleTransition (terminal state)
 *
 * Self-contained from just (firestore, ownerUid, quoteId) — the helper
 * fetches the quote / org / root-quote / salesperson inline so every
 * call-site can fire-and-forget regardless of what context it already
 * has. Keeps the sync hook a single line at each call-site.
 *
 * Best-effort semantics: every internal failure logs a console.warn
 * and resolves with `{ synced: false, reason }`. Never throws to the
 * caller. The parent HL operation (finalize, send, fork, etc.) is the
 * source of truth and must not be blocked by SharePoint flakiness.
 *
 * Code-split: dynamically imports `render-quote-pdf` so the @react-pdf
 * bundle only loads inside the sync flow itself (matches the pattern
 * established in 1.5.0).
 */

import {
    doc,
    getDoc,
    serverTimestamp,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';
import { isConfigUsable, isSharePointEnabled, type SharePointConfig } from '@/lib/sharepoint-config';
import { buildQuoteSharePointPath } from '@/lib/sharepoint-path';

export interface SyncResult {
    synced: boolean;
    /** Set on failures + skipped runs (env disabled, no config, etc.). */
    reason?:
        | 'env-disabled'
        | 'missing-context'
        | 'quote-not-found'
        | 'org-not-found'
        | 'no-config'
        | 'config-not-usable'
        | 'pdf-render-failed'
        | 'api-route-failed'
        | 'patch-failed';
    /** Graph webUrl returned from the upload — operator can click
     *  to open in SharePoint. */
    webUrl?: string;
    /** Full SharePoint path the file landed at, e.g.
     *  "HelmLogic/HelmLogic — NSM/.../Quote.pdf". */
    sharePointPath?: string;
}

interface SyncOptions {
    firestore: Firestore;
    ownerUid: string;
    quoteId: string;
    /** Pre-fetched objects, used when the call-site already has them
     *  to avoid duplicate Firestore reads (the finalize dialog has
     *  every field in its closure already). Optional — the helper
     *  fetches anything not provided. */
    quote?: any;
    organisation?: any;
}

export async function syncQuoteToSharePoint(opts: SyncOptions): Promise<SyncResult> {
    const { firestore, ownerUid, quoteId } = opts;

    // Env gate FIRST — keeps the sync code path identical to pre-1.3.3
    // when SHAREPOINT_ENABLED is off. Zero Firestore reads, zero PDF
    // render cost.
    if (!isSharePointEnabled()) {
        return { synced: false, reason: 'env-disabled' };
    }
    if (!ownerUid || !quoteId) {
        return { synced: false, reason: 'missing-context' };
    }

    try {
        // Resolve the quote.
        let quote = opts.quote;
        if (!quote || quote.id !== quoteId) {
            const snap = await getDoc(doc(firestore, 'users', ownerUid, 'quotes', quoteId));
            if (!snap.exists()) {
                return { synced: false, reason: 'quote-not-found' };
            }
            quote = { id: snap.id, ...snap.data() };
        }
        const orgId = quote.organisationId as string | undefined;
        if (!orgId) {
            return { synced: false, reason: 'org-not-found' };
        }

        // Resolve org (if not provided).
        let organisation = opts.organisation;
        if (!organisation || organisation.id !== orgId) {
            const orgSnap = await getDoc(doc(firestore, 'organisations', orgId));
            if (!orgSnap.exists()) {
                return { synced: false, reason: 'org-not-found' };
            }
            organisation = { id: orgSnap.id, ...orgSnap.data() };
        }

        // Resolve the org's SharePoint config + check usability.
        const cfgSnap = await getDoc(doc(firestore, 'organisations', orgId, 'sharePointConfig', 'default'));
        if (!cfgSnap.exists()) {
            return { synced: false, reason: 'no-config' };
        }
        const cfg = cfgSnap.data() as SharePointConfig;
        if (!isConfigUsable(cfg)) {
            return { synced: false, reason: 'config-not-usable' };
        }

        // Resolve root quote (if the current is a scenario / fork).
        const rootQuoteId = (quote.parentQuoteId as string | undefined) ?? quote.id;
        let rootQuote: any = quote;
        if (rootQuoteId !== quote.id) {
            try {
                const rootSnap = await getDoc(doc(firestore, 'users', ownerUid, 'quotes', rootQuoteId));
                if (rootSnap.exists()) {
                    rootQuote = { id: rootSnap.id, ...rootSnap.data() };
                }
            } catch (e) {
                console.warn('[sharepoint-sync] root quote fetch failed (using self as root)', e);
            }
        }

        // Resolve salesperson display name. Prefers the denormalised
        // `createdByName` on the quote (always set since v1.5), falls
        // back to a fresh users/{uid} lookup, then to 'Unassigned'.
        let salespersonName: string | null = (quote.createdByName as string | undefined) ?? null;
        if (!salespersonName && quote.createdByUid) {
            try {
                const userSnap = await getDoc(doc(firestore, 'users', quote.createdByUid));
                if (userSnap.exists()) {
                    salespersonName = (userSnap.data().displayName as string | undefined) ?? null;
                }
            } catch (e) {
                console.warn('[sharepoint-sync] salesperson lookup failed (using fallback)', e);
            }
        }

        // Build the SharePoint path.
        const built = buildQuoteSharePointPath({
            organisation,
            salespersonName,
            rootQuote,
            quote,
        });

        // Build financials + render the PDF. Both dynamic-imported
        // so the @react-pdf bundle stays code-split.
        let blob: Blob;
        try {
            const [{ renderQuotePdf }, { buildQuoteFinancials }] = await Promise.all([
                import('@/lib/render-quote-pdf'),
                import('@/lib/quote-financials'),
            ]);
            const financials = buildQuoteFinancials(quote);
            const rendered = await renderQuotePdf({
                firestore,
                quote,
                organisation,
                financials,
            });
            blob = rendered.blob;
        } catch (e) {
            console.warn('[sharepoint-sync] PDF render failed', e);
            return { synced: false, reason: 'pdf-render-failed' };
        }

        // POST to API route. The route handles OAuth + folder creation
        // + upload. Failures bubble up here as non-ok responses.
        const form = new FormData();
        form.append('file', blob, built.fileName);
        form.append('payload', JSON.stringify({
            tenantId: cfg.tenantId,
            clientId: cfg.clientId,
            siteId: cfg.siteId,
            folderPath: cfg.folderPath,
            relativePath: built.folderPath,
            fileName: built.fileName,
        }));

        let apiJson: any;
        try {
            const resp = await fetch('/api/sharepoint-sync', { method: 'POST', body: form });
            apiJson = await resp.json().catch(() => null);
            if (!resp.ok || !apiJson?.ok) {
                console.warn('[sharepoint-sync] API route returned non-ok', resp.status, apiJson);
                return { synced: false, reason: 'api-route-failed' };
            }
        } catch (e) {
            console.warn('[sharepoint-sync] API fetch failed', e);
            return { synced: false, reason: 'api-route-failed' };
        }

        // Patch the quote with sync-tracking fields. Rule-layer
        // whitelist (`onlySharePointFieldsChanged()`) allows this even
        // on a locked quote — same OR pattern as lock + lifecycle.
        try {
            await updateDoc(doc(firestore, 'users', ownerUid, 'quotes', quoteId), {
                sharePointSyncedAt: serverTimestamp(),
                sharePointPath: apiJson.fullPath ?? built.fullPath,
                sharePointWebUrl: apiJson.webUrl ?? null,
                updatedAt: serverTimestamp(),
            });
        } catch (e) {
            console.warn('[sharepoint-sync] patch quote with sync fields failed', e);
            return { synced: false, reason: 'patch-failed' };
        }

        return {
            synced: true,
            webUrl: apiJson.webUrl ?? undefined,
            sharePointPath: apiJson.fullPath ?? built.fullPath,
        };
    } catch (e) {
        console.warn('[sharepoint-sync] unexpected failure', e);
        return { synced: false, reason: 'api-route-failed' };
    }
}
