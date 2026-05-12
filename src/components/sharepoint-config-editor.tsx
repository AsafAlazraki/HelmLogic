'use client';

/**
 * SharePoint integration config editor (v1.9 — story 1.3.3).
 *
 * Mounted in `/manage` → Integrations tab. Org admins set the four
 * public-identifier fields plus the per-org enabled toggle. The
 * client secret lives in Firebase App Hosting env
 * (`SHAREPOINT_CLIENT_SECRET`) and is never edited from this surface
 * (see `tasks/ADMIN_TASK_sharepoint-setup.md` for the full setup
 * walkthrough — link rendered in the helper card below).
 *
 * Pre-existing config is loaded via the live useSharePointConfig hook
 * so an admin can see at a glance what's been configured. Saves write
 * to `organisations/{orgId}/sharePointConfig/default` with
 * `configuredAt` / `configuredByUid` / `configuredByName` denormalised.
 */

import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ExternalLink, Loader2, Save, ShieldCheck } from 'lucide-react';
import {
    isSharePointEnabled,
    type SharePointConfig,
    useSharePointConfig,
} from '@/lib/sharepoint-config';

interface Props {
    orgId: string;
}

export function SharePointConfigEditor({ orgId }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const userProfileRef = (user
        ? doc(firestore, 'users', user.uid)
        : null);
    const { data: userProfile } = useDoc<{ displayName?: string }>(userProfileRef);
    const { toast } = useToast();
    const { data: existing } = useSharePointConfig(orgId);

    const [enabled, setEnabled] = useState(false);
    const [tenantId, setTenantId] = useState('');
    const [clientId, setClientId] = useState('');
    const [siteId, setSiteId] = useState('');
    const [folderPath, setFolderPath] = useState('HelmLogic');
    const [saving, setSaving] = useState(false);

    // Hydrate inputs from the loaded config on first arrival. Doesn't
    // clobber in-flight edits because we only run when `existing.id`
    // changes (matches the v1.5 detail-sheet pattern).
    useEffect(() => {
        if (!existing) return;
        setEnabled(existing.enabled === true);
        setTenantId(existing.tenantId ?? '');
        setClientId(existing.clientId ?? '');
        setSiteId(existing.siteId ?? '');
        setFolderPath(existing.folderPath ?? 'HelmLogic');
    }, [existing?.tenantId, existing?.clientId, existing?.siteId, existing?.folderPath, existing?.enabled]);

    const envOn = isSharePointEnabled();
    const allFilled = !!(tenantId.trim() && clientId.trim() && siteId.trim() && folderPath.trim());

    async function handleSave() {
        if (!user) return;
        setSaving(true);
        try {
            const payload: SharePointConfig = {
                enabled,
                tenantId: tenantId.trim(),
                clientId: clientId.trim(),
                siteId: siteId.trim(),
                folderPath: folderPath.trim(),
                configuredAt: serverTimestamp() as any,
                configuredByUid: user.uid,
                configuredByName: userProfile?.displayName || user.displayName || user.email || 'Someone',
            };
            await setDoc(
                doc(firestore, 'organisations', orgId, 'sharePointConfig', 'default'),
                payload,
            );
            toast({
                title: 'SharePoint config saved',
                description: enabled
                    ? 'Sync will run on the next quote event (finalize / send / scenario / fork / terminal lifecycle).'
                    : 'Saved as disabled — flip the toggle when you\'re ready to start syncing.',
            });
        } catch (e: any) {
            console.error('[sharepoint-config-editor] save failed', e);
            toast({
                variant: 'destructive',
                title: 'Could not save config',
                description: e?.message ?? 'See console.',
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                            SharePoint Integration
                            {existing?.enabled && allFilled && envOn ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                                    <ShieldCheck className="h-3 w-3" /> Active
                                </Badge>
                            ) : existing?.enabled && allFilled && !envOn ? (
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Waiting on env flag
                                </Badge>
                            ) : (
                                <Badge variant="outline">Not configured</Badge>
                            )}
                        </CardTitle>
                        <CardDescription>
                            One-way mirror of quote PDFs into a SharePoint site. HelmLogic stays
                            the source of truth — edits made in SharePoint don't sync back. Sync
                            fires on finalize, send, scenario create, fork-on-edit, and terminal
                            lifecycle transitions.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {!envOn && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-black uppercase tracking-widest text-amber-800 text-[10px]">Env flag is OFF</p>
                            <p className="text-amber-700 mt-0.5">
                                <code className="bg-amber-100 rounded px-1">NEXT_PUBLIC_SHAREPOINT_ENABLED</code> is not
                                set to <code className="bg-amber-100 rounded px-1">true</code>. Configure your fields
                                here and click Save — sync starts automatically once a HelmLogic admin flips the env
                                flag in Firebase App Hosting. See <code className="bg-amber-100 rounded px-1">tasks/ADMIN_TASK_sharepoint-setup.md</code>.
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between rounded-xl border bg-slate-50 p-3">
                    <div>
                        <p className="text-sm font-semibold text-slate-800">Sync enabled for this org</p>
                        <p className="text-xs text-slate-500">
                            Per-org kill switch. Turn off to pause syncs without losing the
                            connection config.
                        </p>
                    </div>
                    <Switch checked={enabled} onCheckedChange={setEnabled} disabled={saving} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="sp-tenant" className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                            Azure tenant ID
                        </Label>
                        <Input
                            id="sp-tenant"
                            placeholder="e.g. 11111111-2222-3333-4444-555555555555"
                            value={tenantId}
                            onChange={(e) => setTenantId(e.target.value)}
                            disabled={saving}
                        />
                        <p className="text-[10px] text-slate-500">Your org's Microsoft 365 tenant — NOT HelmLogic's.</p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="sp-client" className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                            HelmLogic app client ID
                        </Label>
                        <Input
                            id="sp-client"
                            placeholder="Same value for every org (from admin doc)"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            disabled={saving}
                        />
                        <p className="text-[10px] text-slate-500">The Application (client) ID of the multi-tenant HelmLogic Azure app.</p>
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                        <Label htmlFor="sp-site" className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                            SharePoint site ID
                        </Label>
                        <Input
                            id="sp-site"
                            placeholder="e.g. nsmarine.sharepoint.com,abc12345-...,def67890-..."
                            value={siteId}
                            onChange={(e) => setSiteId(e.target.value)}
                            disabled={saving}
                        />
                        <p className="text-[10px] text-slate-500">
                            Graph composite ID — NOT the user-facing URL. Fetch with{' '}
                            <code className="bg-slate-100 rounded px-1 text-[10px]">GET /sites/{`{hostname}`}:/sites/{`{site}`}</code>.
                        </p>
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                        <Label htmlFor="sp-folder" className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                            Root folder path
                        </Label>
                        <Input
                            id="sp-folder"
                            placeholder="HelmLogic"
                            value={folderPath}
                            onChange={(e) => setFolderPath(e.target.value)}
                            disabled={saving}
                        />
                        <p className="text-[10px] text-slate-500">
                            Relative to the site's default document library. HelmLogic creates the
                            folder on first sync if it doesn't exist.
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3 text-xs space-y-1.5">
                    <p className="font-black uppercase tracking-widest text-slate-600 text-[10px]">Setup walkthrough</p>
                    <p className="text-slate-600">
                        Full Azure app-registration + SharePoint permission + env-var setup is in
                        the admin doc — paste it to a HelmLogic admin who has Azure access.
                    </p>
                    <a
                        href="https://github.com/asafalazraki/helmlogic/blob/main/tasks/ADMIN_TASK_sharepoint-setup.md"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 font-semibold hover:underline"
                    >
                        ADMIN_TASK_sharepoint-setup.md <ExternalLink className="h-3 w-3" />
                    </a>
                </div>

                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {saving ? 'Saving…' : 'Save SharePoint config'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
