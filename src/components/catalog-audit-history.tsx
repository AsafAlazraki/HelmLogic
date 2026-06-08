'use client';

/**
 * CatalogAuditHistory (v1.11 follow-up).
 *
 * Live view of `organisations/{orgId}/catalogAudit` — every catalog
 * import + manual edit (when wired) lands here with who, when, and a
 * row-level diff. Newest first. Click a row to expand the per-row diff.
 *
 * v1.11 launch update — also merges `organisations/{orgId}/fitUpCatalogAudit`
 * so the unified audit view covers every fit-up item / package edit
 * (create / update / delete) alongside the xlsx imports.
 */

import { useMemo, useState } from 'react';
import { collection, orderBy, query } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, ChevronDown, ChevronRight, FileSpreadsheet, Pencil, Wrench } from 'lucide-react';

interface AuditRowChange { field: string; current: any; next: any; }
interface AuditRow {
    sheetName?: string;
    op: 'create' | 'update' | 'delete';
    docId?: string;
    naturalKey?: string;
    changes?: AuditRowChange[];
    fields?: string[];
}

interface AuditDoc {
    id: string;
    source: 'catalog-import' | 'manual-edit' | 'fit-up' | string;
    actorUid?: string | null;
    actorName?: string | null;
    committedAt?: any;
    counts?: { updated?: number; created?: number; skipped?: number };
    rows?: AuditRow[];
    rowCount?: number;
}

interface FitUpAuditDoc {
    id: string;
    actorUid?: string;
    actorName?: string;
    at?: any;
    resource?: 'fitUpItem' | 'fitUpPackage';
    resourceId?: string;
    resourceName?: string;
    action?: 'created' | 'updated' | 'deleted';
    diff?: Record<string, { from: any; to: any }>;
}

export function CatalogAuditHistory({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const q = useMemoFirebase(
        () => query(collection(firestore, 'organisations', organisationId, 'catalogAudit'), orderBy('committedAt', 'desc')),
        [firestore, organisationId],
    );
    const fitUpQ = useMemoFirebase(
        () => query(collection(firestore, 'organisations', organisationId, 'fitUpCatalogAudit'), orderBy('at', 'desc')),
        [firestore, organisationId],
    );
    const { data: entries, isLoading } = useCollection<AuditDoc>(q);
    const { data: fitUpEntries, isLoading: fitUpLoading } = useCollection<FitUpAuditDoc>(fitUpQ);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    // Merge both audit feeds into one chronological list, newest first.
    const merged = useMemo(() => {
        const catalogRows: AuditDoc[] = (entries ?? []).map(e => ({ ...e }));
        const fitUpRows: AuditDoc[] = (fitUpEntries ?? []).map(f => {
            const fieldChanges: AuditRowChange[] = f.diff
                ? Object.entries(f.diff).map(([field, d]) => ({ field, current: d.from, next: d.to }))
                : [];
            return {
                id: f.id,
                source: 'fit-up',
                actorUid: f.actorUid ?? null,
                actorName: f.actorName ?? null,
                committedAt: f.at,
                counts: f.action === 'created'
                    ? { created: 1 }
                    : f.action === 'deleted'
                        ? { skipped: 1 }
                        : { updated: 1 },
                rows: [{
                    sheetName: f.resource === 'fitUpPackage' ? 'Fit-Up Package' : 'Fit-Up Item',
                    op: (f.action === 'created' ? 'create' : f.action === 'deleted' ? 'delete' : 'update') as 'create' | 'update' | 'delete',
                    docId: f.resourceId,
                    naturalKey: f.resourceName,
                    changes: fieldChanges,
                }],
                rowCount: 1,
            };
        });
        const all = [...catalogRows, ...fitUpRows];
        all.sort((a, b) => {
            const at = a.committedAt?.toMillis?.() ?? 0;
            const bt = b.committedAt?.toMillis?.() ?? 0;
            return bt - at;
        });
        return all;
    }, [entries, fitUpEntries]);

    if (isLoading || fitUpLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
    const list = merged;
    if (list.length === 0) {
        return (
            <div className="p-8 text-center border-2 border-dashed rounded-xl">
                <History className="h-8 w-8 mx-auto opacity-30" />
                <p className="text-xs text-muted-foreground mt-2">No catalog audits yet. Run a Catalog Import or edit a Fit-Up item and a record will land here.</p>
            </div>
        );
    }
    return (
        <div className="space-y-2">
            {list.map(e => {
                const isOpen = !!expanded[e.id];
                const when = e.committedAt?.toDate?.()?.toLocaleString?.() ?? '—';
                const updated = e.counts?.updated ?? 0;
                const created = e.counts?.created ?? 0;
                const skipped = e.counts?.skipped ?? 0;
                return (
                    <div key={e.id} className="border-2 rounded-xl overflow-hidden">
                        <button
                            onClick={() => setExpanded(s => ({ ...s, [e.id]: !s[e.id] }))}
                            className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left"
                        >
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                            {e.source === 'catalog-import'
                                ? <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                                : e.source === 'fit-up'
                                    ? <Wrench className="h-4 w-4 text-teal-600 shrink-0" />
                                    : <Pencil className="h-4 w-4 text-amber-600 shrink-0" />}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold">{e.actorName ?? 'Unknown'} · <span className="text-muted-foreground font-normal">{e.source}</span></p>
                                <p className="text-[10px] text-muted-foreground">{when}</p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                                {updated > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[9px] font-black uppercase">~ {updated}</Badge>}
                                {created > 0 && <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[9px] font-black uppercase">+ {created}</Badge>}
                                {skipped > 0 && <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[9px] font-black uppercase">{skipped} skipped</Badge>}
                            </div>
                        </button>
                        {isOpen && (
                            <div className="border-t bg-slate-50/50 p-3 space-y-2">
                                {e.rowCount != null && (e.rows?.length ?? 0) < e.rowCount && (
                                    <p className="text-[10px] italic text-muted-foreground">Showing {e.rows?.length ?? 0} of {e.rowCount} rows — large imports are truncated.</p>
                                )}
                                {(e.rows ?? []).map((r, i) => (
                                    <div key={i} className="bg-white rounded-lg border p-2.5 text-[11px]">
                                        <div className="flex items-center gap-2 mb-1">
                                            {r.sheetName && <Badge variant="outline" className="text-[9px] font-black uppercase">{r.sheetName}</Badge>}
                                            <Badge className={`text-[9px] font-black uppercase ${r.op === 'create' ? 'bg-emerald-500' : r.op === 'update' ? 'bg-amber-500' : 'bg-slate-500'}`}>{r.op}</Badge>
                                            <span className="font-mono">{r.naturalKey ?? r.docId ?? '—'}</span>
                                        </div>
                                        {r.changes && r.changes.length > 0 && (
                                            <div className="ml-1 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                                {r.changes.map((c, ci) => (
                                                    <div key={ci} className="text-[10px] font-mono bg-slate-50 rounded px-2 py-1">
                                                        <span className="font-bold text-slate-700">{c.field}: </span>
                                                        <span className="text-rose-600 line-through">{c.current == null ? '∅' : Array.isArray(c.current) ? c.current.join('|') : String(c.current)}</span>
                                                        <span className="mx-1 text-slate-400">→</span>
                                                        <span className="text-emerald-700">{Array.isArray(c.next) ? c.next.join('|') : String(c.next)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {r.fields && r.fields.length > 0 && (
                                            <p className="text-[10px] text-muted-foreground italic mt-1">fields: {r.fields.join(', ')}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
