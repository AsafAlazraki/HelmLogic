'use client';

/**
 * Salesperson Message Editor (v1.7 — story 1.8.12).
 *
 * Special editor for the 'salesperson-message' content-block slot.
 * Replaces the standard ContentBlockDetail when the user clicks
 * the Salesperson Message row in the master list.
 *
 * Layout: list of org users on the left, edit pane on the right.
 *   - List: user photo + name + role + status chip (Has message / Empty)
 *   - Edit pane: TipTap message + PhotoUploader
 *
 * Persistence: organisations/{orgId}/salesTeam/{userId} via
 * saveSalesTeamMember(). Each user can also edit their own message
 * (no per-row gating in v1.7 — admin-only via the existing /manage
 * UI gate which lives at the parent component layer).
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FeatureRichTextEditor } from '@/components/feature-rich-text-editor';
import { PhotoUploader } from '@/components/photo-uploader';
import {
    saveSalesTeamMember,
    salesTeamPhotoPrefix,
    type SalesTeamMember,
} from '@/lib/sales-team';
import {
    CheckCircle2,
    CircleDashed,
    Info,
    Loader2,
    Save,
    User as UserIcon,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrgUser {
    id: string;
    displayName?: string;
    email?: string;
    organisationId?: string;
    organisationRole?: string;
    photoURL?: string;
}

interface Props {
    orgId: string;
}

export function SalespersonMessageEditor({ orgId }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    /** Org members — users where organisationId === orgId. */
    const usersRef = useMemoFirebase(
        () => query(collection(firestore, 'users'), where('organisationId', '==', orgId)),
        [firestore, orgId],
    );
    const { data: users, loading: usersLoading } = useCollection<OrgUser>(usersRef);

    /** Live salesTeam subcollection — one doc per user. */
    const salesTeamRef = useMemoFirebase(
        () => collection(firestore, `organisations/${orgId}/salesTeam`),
        [firestore, orgId],
    );
    const { data: salesTeam } = useCollection<SalesTeamMember>(salesTeamRef);
    const teamByUid = useMemo(() => {
        const m = new Map<string, SalesTeamMember>();
        for (const t of salesTeam ?? []) {
            if (t.id) m.set(t.id, t);
        }
        return m;
    }, [salesTeam]);

    /** Selection — defaults to the current user (so each salesperson
     *  lands on their own profile when they open the tab). */
    const [selectedUid, setSelectedUid] = useState<string | null>(null);
    useEffect(() => {
        if (selectedUid) return;
        if (user?.uid) {
            setSelectedUid(user.uid);
            return;
        }
        if ((users ?? []).length > 0) {
            setSelectedUid(users![0].id);
        }
    }, [selectedUid, user?.uid, users]);

    const selectedUser = (users ?? []).find(u => u.id === selectedUid);
    const selectedTeam = selectedUid ? teamByUid.get(selectedUid) : undefined;

    /** Draft state — keyed by selectedUid so switching users doesn't
     *  leak edits. Reset whenever selection or persisted doc changes. */
    const [draftMessage, setDraftMessage] = useState<string>('');
    const [draftSignOff, setDraftSignOff] = useState<string>('');
    const [draftPhotoUrl, setDraftPhotoUrl] = useState<string | null>(null);
    const [draftRole, setDraftRole] = useState<string>('');
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Reset draft when selection or persisted data changes.
        setDraftMessage(selectedTeam?.messageHtml ?? '');
        setDraftSignOff(selectedTeam?.signOff ?? '');
        setDraftPhotoUrl(selectedTeam?.photoUrl ?? null);
        setDraftRole(selectedTeam?.role ?? selectedUser?.organisationRole ?? '');
        setEditMode(false);
    }, [selectedUid, selectedTeam?.id, selectedTeam?.messageHtml, selectedTeam?.signOff, selectedTeam?.photoUrl, selectedTeam?.role, selectedUser?.organisationRole]);

    function startEdit() {
        setEditMode(true);
    }

    function cancelEdit() {
        setDraftMessage(selectedTeam?.messageHtml ?? '');
        setDraftSignOff(selectedTeam?.signOff ?? '');
        setDraftPhotoUrl(selectedTeam?.photoUrl ?? null);
        setDraftRole(selectedTeam?.role ?? selectedUser?.organisationRole ?? '');
        setEditMode(false);
    }

    async function handleSave() {
        if (!user || !selectedUid || !selectedUser) return;
        setSaving(true);
        try {
            await saveSalesTeamMember(firestore, orgId, selectedUid, {
                displayName: selectedUser.displayName ?? selectedUser.email ?? 'Salesperson',
                role: draftRole || undefined,
                messageHtml: draftMessage,
                photoUrl: draftPhotoUrl,
                signOff: draftSignOff || undefined,
            }, user.uid);
            toast({ title: 'Salesperson message saved', description: selectedUser.displayName ?? selectedUser.email });
            setEditMode(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e?.message ?? 'See console.' });
            console.error('[salesperson-message]', e);
        } finally {
            setSaving(false);
        }
    }

    const hasMessage = !!(selectedTeam?.messageHtml && selectedTeam.messageHtml.trim());

    return (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            {/* Left — list of org members */}
            <div className="xl:col-span-2 rounded-xl border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b bg-slate-50">
                    <h3 className="text-sm font-semibold text-slate-700">Sales Team</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        Each salesperson&apos;s message + photo appears on quotes they create
                    </p>
                </div>
                {usersLoading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                ) : (users ?? []).length === 0 ? (
                    <div className="p-6 text-xs text-slate-500 text-center">
                        No org members found yet. Invite users in the Users &amp; Permissions tab.
                    </div>
                ) : (
                    <ul className="divide-y max-h-[60vh] overflow-y-auto">
                        {(users ?? []).map(u => {
                            const t = teamByUid.get(u.id);
                            const userHas = !!(t?.messageHtml && t.messageHtml.trim());
                            const isSelected = u.id === selectedUid;
                            return (
                                <li key={u.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedUid(u.id)}
                                        className={cn(
                                            'w-full text-left px-3 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3',
                                            isSelected && 'bg-blue-50/60 hover:bg-blue-50/60',
                                        )}
                                    >
                                        {/* Photo */}
                                        <div className="h-10 w-10 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200">
                                            {t?.photoUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={t.photoUrl} alt={u.displayName ?? ''} className="w-full h-full object-cover" />
                                            ) : (
                                                <UserIcon className="h-4 w-4 text-slate-400" />
                                            )}
                                        </div>
                                        {/* Name + status */}
                                        <div className="min-w-0 flex-1">
                                            <p className={cn('text-sm font-medium truncate', isSelected ? 'text-blue-900' : 'text-slate-700')}>
                                                {u.displayName ?? u.email ?? u.id}
                                            </p>
                                            <p className="text-[11px] text-slate-500 truncate">
                                                {t?.role ?? u.organisationRole ?? 'Member'}
                                            </p>
                                        </div>
                                        {userHas ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                        ) : (
                                            <CircleDashed className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Right — edit pane */}
            <div className="xl:col-span-3 rounded-[1.5rem] overflow-hidden border-2 shadow-sm bg-white">
                {!selectedUser ? (
                    <div className="p-12 text-center text-xs text-slate-400">
                        Select a salesperson on the left to author their message.
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="px-6 py-5 bg-slate-900 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-12 w-12 rounded-full bg-white/10 overflow-hidden flex items-center justify-center shrink-0 border border-white/20">
                                    {(editMode ? draftPhotoUrl : selectedTeam?.photoUrl) ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={(editMode ? draftPhotoUrl : selectedTeam?.photoUrl)!} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <UserIcon className="h-5 w-5 text-white/70" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base font-black uppercase tracking-tight text-white truncate">
                                        {selectedUser.displayName ?? selectedUser.email}
                                    </h3>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                                        {hasMessage ? 'Has message' : 'Empty'} · Salesperson Section
                                    </p>
                                </div>
                            </div>
                            {!editMode && (
                                <Button size="sm" onClick={startEdit} className="gap-1.5 bg-white text-slate-900 hover:bg-slate-100 text-xs">
                                    {hasMessage ? 'Edit' : 'Add content'}
                                </Button>
                            )}
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto bg-slate-50/30">
                            {editMode ? (
                                <div className="space-y-5">
                                    {/* Photo + role row */}
                                    <div className="flex items-start gap-6 flex-wrap">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Photo</p>
                                            <PhotoUploader
                                                value={draftPhotoUrl}
                                                onChange={setDraftPhotoUrl}
                                                storagePathPrefix={salesTeamPhotoPrefix(orgId, selectedUid!)}
                                                size="md"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-[200px] space-y-3">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Role / Title</p>
                                                <Input
                                                    value={draftRole}
                                                    onChange={e => setDraftRole(e.target.value)}
                                                    placeholder="e.g. Senior Salesperson, Sales Manager"
                                                    className="text-sm"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Sign-off</p>
                                                <Input
                                                    value={draftSignOff}
                                                    onChange={e => setDraftSignOff(e.target.value)}
                                                    placeholder="e.g. Cheers, Bill"
                                                    className="text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Message editor */}
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Personal Message</p>
                                        <FeatureRichTextEditor
                                            value={draftMessage}
                                            onChange={setDraftMessage}
                                            placeholder={`Write your personal note that customers see at the top of every quote you create. Welcome them, introduce yourself, set the tone for the proposal.`}
                                        />
                                    </div>

                                    <div className="flex items-center justify-end gap-2 pt-3 border-t">
                                        <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving} className="gap-1.5">
                                            <X className="h-3.5 w-3.5" />
                                            Cancel
                                        </Button>
                                        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                                            {saving ? (
                                                <>
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    Saving…
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="h-3.5 w-3.5" />
                                                    Save
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            ) : hasMessage ? (
                                <article
                                    className="prose prose-sm max-w-none text-slate-700 [&_p]:my-2"
                                    dangerouslySetInnerHTML={{ __html: selectedTeam!.messageHtml }}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 border-2 border-dashed rounded-lg bg-white">
                                    <UserIcon className="h-8 w-8 mb-3" />
                                    <p className="text-sm font-medium text-slate-500">No message yet for {selectedUser.displayName ?? selectedUser.email}</p>
                                    <p className="text-[11px] mt-1 max-w-xs">
                                        Click <strong>Add content</strong> to author their personal note + photo.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer hint */}
                        <div className="px-5 py-2.5 border-t bg-blue-50/40 text-[10px] text-blue-700 flex items-center gap-1.5">
                            <Info className="h-3 w-3" />
                            This salesperson&apos;s message + photo appears on the cover of any quote they create.
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
