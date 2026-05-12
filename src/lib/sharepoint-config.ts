/**
 * SharePoint per-org config (v1.9 — story 1.3.3).
 *
 * Each org that wants the SharePoint mirror gets exactly ONE config
 * doc at:
 *
 *   organisations/{orgId}/sharePointConfig/default
 *
 * The doc id is fixed to `default` for v1.9 — multi-site support
 * (e.g. one config per business unit) is v1.10+.
 *
 * Secret-handling rule: the Azure app client secret lives in Firebase
 * App Hosting backend env (`SHAREPOINT_CLIENT_SECRET`) — NEVER in
 * Firestore, NEVER in `NEXT_PUBLIC_*`, NEVER in the client bundle.
 * The Firestore doc only carries the public identifiers (tenantId,
 * clientId, siteId) plus the operator-chosen `folderPath`.
 *
 * Env-flag gating: the Send-flag pattern from v1.8. The flag controls
 * whether the sync hooks attempt anything; if the flag is false the
 * code path is a silent no-op even with config present. Mirrors the
 * `isEmailSendEnabled()` pattern in `src/lib/email-send.ts`.
 */

import { doc, type Timestamp } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';

export interface SharePointConfig {
    /** Operator-side toggle. Even with the env flag true and valid
     *  credentials, leaving this false short-circuits the sync for
     *  this specific org. */
    enabled: boolean;
    /** Azure AD tenant id of the consuming org (NOT HelmLogic's tenant
     *  — each org's tenant). UUID format. */
    tenantId: string;
    /** Azure app (client) id of the HelmLogic SharePoint Sync app.
     *  Same value across every org since we use ONE multi-tenant app
     *  in v1.9. Stored per-org so future per-org-Azure-app support is
     *  a config field change, not a code change. */
    clientId: string;
    /** Microsoft Graph site id — the composite key returned from
     *  `GET /sites/{hostname}:/sites/{site}`, e.g.
     *  `nsmarine.sharepoint.com,abc12345-...,def67890-...`. NOT the
     *  user-facing URL. */
    siteId: string;
    /** Root folder path relative to the site's default drive (e.g.
     *  `HelmLogic` or `Sales/Quotes`). HelmLogic creates the folder on
     *  first sync if it doesn't exist. */
    folderPath: string;
    configuredAt?: Timestamp;
    configuredByUid?: string;
    configuredByName?: string;
}

/**
 * Returns true when the SharePoint sync env flag is on. UI gates the
 * "SharePoint integration" surface on this; sync hooks bail early when
 * false to keep behaviour identical to pre-1.3.3 builds.
 */
export function isSharePointEnabled(): boolean {
    if (typeof process === 'undefined' || !process.env) return false;
    return process.env.NEXT_PUBLIC_SHAREPOINT_ENABLED === 'true';
}

/**
 * True when a config doc is fully-populated enough to attempt a sync.
 * Lets call-sites short-circuit BEFORE asking the user to render a
 * PDF that we can't upload anyway.
 */
export function isConfigUsable(cfg: SharePointConfig | null | undefined): boolean {
    if (!cfg) return false;
    if (cfg.enabled !== true) return false;
    return Boolean(cfg.tenantId?.trim() && cfg.clientId?.trim() && cfg.siteId?.trim() && cfg.folderPath?.trim());
}

/**
 * Live subscription to an org's SharePoint config. Returns `null` data
 * while loading or when the org has no config yet — call-sites bail in
 * both cases.
 */
export function useSharePointConfig(orgId: string | null | undefined) {
    const firestore = useFirestore();
    const ref = useMemoFirebase(
        () => (orgId
            ? doc(firestore, 'organisations', orgId, 'sharePointConfig', 'default')
            : null),
        [firestore, orgId],
    );
    return useDoc<SharePointConfig>(ref);
}
