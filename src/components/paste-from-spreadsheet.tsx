
'use client';

/**
 * PasteFromSpreadsheet (v1.17 — Story 3.10.2).
 *
 * One-shot data-import dialog that takes a TSV/CSV paste from Excel or
 * Google Sheets, auto-detects a natural key column (per the v1.4 import
 * lesson — Part Number > Model Code > Model ID > SKU > Code > ID > Model
 * > Model Name > first column), shows a preview diff (created / updated
 * / unchanged / skipped), then upserts on confirm.
 *
 * Idempotent. Re-pasting the same payload produces all 'unchanged' rows.
 * Operator edits stay safe because we never clear-and-replace.
 *
 * Generic over the collection path so it can be wired into MotorsTableView,
 * TrailersTableView, BoatsTableView, and the Fit-Up catalog with the same
 * UI. Each caller passes:
 *   - collectionPath: array of path segments
 *   - existingRows: current snapshot (for diff)
 *   - allowedKeys: prioritised list of key-column candidates
 */

import { useMemo, useState } from 'react';
import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, ClipboardPaste, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const DEFAULT_KEY_PRIORITY = [
    'Part Number',
    'Model Code',
    'Model ID',
    'SKU',
    'Code',
    'ID',
    'Model',
    'Model Name',
];

interface ExistingRow {
    id: string;
    [k: string]: any;
}

interface DiffRow {
    keyValue: string;
    incoming: Record<string, string>;
    existingId?: string;
    op: 'create' | 'update' | 'unchanged' | 'skip-no-key';
    changedFields?: string[];
}

interface PasteFromSpreadsheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Firestore path segments for the target collection. */
    collectionPath: string[];
    /** Existing rows (post-filter) for the diff. */
    existingRows: ExistingRow[];
    /** Prioritised list of key column candidates. Defaults to DEFAULT_KEY_PRIORITY. */
    allowedKeys?: string[];
    /** Resource label for toasts ('motors', 'trailers', 'parts', etc.). */
    resourceLabel?: string;
    onApplied?: (summary: { created: number; updated: number; unchanged: number; skipped: number }) => void;
}

export function parseTsvOrCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
    const text = raw.trim();
    if (!text) return { headers: [], rows: [] };
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const delim = lines[0].includes('\t') ? '\t' : ',';
    const split = (line: string): string[] => {
        if (delim === '\t') return line.split('\t');
        // Naive CSV split that respects double-quoted fields.
        const out: string[] = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
                inQ = !inQ; continue;
            }
            if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
            cur += ch;
        }
        out.push(cur);
        return out;
    };
    const headers = split(lines[0]).map(h => h.trim());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = split(lines[i]);
        const r: Record<string, string> = {};
        for (let h = 0; h < headers.length; h++) r[headers[h]] = (cells[h] ?? '').trim();
        rows.push(r);
    }
    return { headers, rows };
}

export function detectKeyColumn(headers: string[], priority: string[] = DEFAULT_KEY_PRIORITY): string | null {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    const headerNorms = headers.map(norm);
    for (const want of priority) {
        const i = headerNorms.indexOf(norm(want));
        if (i >= 0) return headers[i];
    }
    return headers[0] ?? null;
}

export function buildDiff(
    incoming: Record<string, string>[],
    keyColumn: string,
    existingRows: ExistingRow[],
): DiffRow[] {
    const byKey = new Map<string, ExistingRow>();
    for (const r of existingRows) {
        const k = String(r[keyColumn] ?? r.id);
        if (k) byKey.set(k, r);
    }
    return incoming.map<DiffRow>(row => {
        const key = (row[keyColumn] ?? '').trim();
        if (!key) return { keyValue: '', incoming: row, op: 'skip-no-key' };
        const existing = byKey.get(key);
        if (!existing) return { keyValue: key, incoming: row, op: 'create' };
        const changed: string[] = [];
        for (const [k, v] of Object.entries(row)) {
            const cur = existing[k];
            if (cur == null && !v) continue;
            if (String(cur ?? '') !== v) changed.push(k);
        }
        return {
            keyValue: key,
            incoming: row,
            existingId: existing.id,
            op: changed.length > 0 ? 'update' : 'unchanged',
            changedFields: changed,
        };
    });
}

export function PasteFromSpreadsheet({
    open,
    onOpenChange,
    collectionPath,
    existingRows,
    allowedKeys = DEFAULT_KEY_PRIORITY,
    resourceLabel = 'rows',
    onApplied,
}: PasteFromSpreadsheetProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [pasted, setPasted] = useState('');
    const [applying, setApplying] = useState(false);

    const parsed = useMemo(() => parseTsvOrCsv(pasted), [pasted]);
    const keyColumn = useMemo(() => detectKeyColumn(parsed.headers, allowedKeys), [parsed.headers, allowedKeys]);
    const diff = useMemo(() => keyColumn ? buildDiff(parsed.rows, keyColumn, existingRows) : [], [parsed.rows, keyColumn, existingRows]);

    const counts = useMemo(() => {
        const c = { create: 0, update: 0, unchanged: 0, 'skip-no-key': 0 };
        for (const d of diff) c[d.op] += 1;
        return c;
    }, [diff]);

    const apply = async () => {
        if (!keyColumn) return;
        setApplying(true);
        let created = 0, updated = 0, unchanged = 0, skipped = 0;
        try {
            for (const d of diff) {
                if (d.op === 'unchanged') { unchanged += 1; continue; }
                if (d.op === 'skip-no-key') { skipped += 1; continue; }
                const patch: Record<string, any> = { ...d.incoming, updatedAt: serverTimestamp() };
                if (d.op === 'create') {
                    const newId = d.keyValue;
                    const ref = doc(firestore, collectionPath[0], ...collectionPath.slice(1), newId);
                    await setDoc(ref, patch, { merge: true });
                    created += 1;
                } else if (d.op === 'update' && d.existingId) {
                    const ref = doc(firestore, collectionPath[0], ...collectionPath.slice(1), d.existingId);
                    await setDoc(ref, patch, { merge: true });
                    updated += 1;
                }
            }
            toast({
                title: `Paste applied`,
                description: `${created} created · ${updated} updated · ${unchanged} unchanged · ${skipped} skipped (no key) in ${resourceLabel}.`,
            });
            onApplied?.({ created, updated, unchanged, skipped });
            setPasted('');
            onOpenChange(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Paste failed', description: err?.message ?? String(err) });
        } finally {
            setApplying(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ClipboardPaste className="h-4 w-4" /> Paste from spreadsheet
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Paste TSV (from Excel / Google Sheets) or CSV. We auto-detect the key
                        column and show a preview diff before writing. Existing rows are merged,
                        not overwritten. Rows without a key value are skipped.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Textarea
                        rows={8}
                        placeholder="Paste rows here. First row should be the headers (Part Number, Model Name, Cost, Sell, ...)."
                        value={pasted}
                        onChange={e => setPasted(e.target.value)}
                        className="font-mono text-xs"
                    />
                    {parsed.headers.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                                <span className="font-bold">Headers:</span>
                                {parsed.headers.map(h => (
                                    <Badge key={h} variant="outline" className="text-[10px]">{h}</Badge>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <span className="font-bold">Key column:</span>
                                {keyColumn ? (
                                    <Badge className="text-[10px]">{keyColumn}</Badge>
                                ) : (
                                    <Badge variant="destructive" className="text-[10px]">none detected</Badge>
                                )}
                            </div>
                            <div data-testid="paste-diff-summary" className="flex items-center gap-3 text-xs">
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                                    {counts.create} new
                                </Badge>
                                <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300">
                                    {counts.update} updated
                                </Badge>
                                <Badge variant="outline" className="bg-slate-50 text-slate-600">
                                    {counts.unchanged} unchanged
                                </Badge>
                                {counts['skip-no-key'] > 0 && (
                                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300">
                                        <AlertCircle className="h-3 w-3 mr-1" /> {counts['skip-no-key']} skipped
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>
                        Cancel
                    </Button>
                    <Button onClick={apply} disabled={applying || !keyColumn || parsed.rows.length === 0}>
                        {applying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Apply ({counts.create + counts.update} writes)
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
