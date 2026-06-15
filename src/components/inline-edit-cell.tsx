'use client';

/**
 * InlineEditCell (v1.13 — Stories 3.8.1 + 3.8.2).
 *
 * Click-to-edit cell for catalogue table views. Mirrors the spreadsheet
 * pattern operators are used to:
 *
 *   - Click the cell → Input (or Select) replaces the read view
 *   - Tab / Enter to commit · Esc to cancel
 *   - Save on blur via the supplied `onSave` (returns a promise; caller
 *     handles the Firestore write + downstream side effects)
 *   - Tiny loader pip while saving, toast on result
 *
 * Three flavours:
 *   - <InlineEditCell type="text">       — string field
 *   - <InlineEditCell type="number">     — numeric (validated, parsed)
 *   - <InlineEditCell type="currency">   — numeric + currency rendering
 *
 * The toast + write itself is the caller's responsibility — this component
 * is pure presentation + state, so it can be dropped into any table without
 * coupling to a particular Firestore path.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/currency-utils';

interface CommonProps {
    /** Class applied to the read-state wrapper. Use to match the surrounding cell font / colour. */
    className?: string;
    /** When true, the cell is read-only — no edit affordance. */
    disabled?: boolean;
    /** Custom display label override (e.g. "—" for null). Default renders the value. */
    placeholder?: string;
    /** Save handler. Throw / reject to surface an error. */
    onSave: (next: string | number | null) => Promise<void>;
    /** Optional validator. Return null for "ok", or a string error message. */
    validate?: (next: any) => string | null;
}

type Props =
    | (CommonProps & { type: 'text'; value: string | null | undefined })
    | (CommonProps & { type: 'number'; value: number | null | undefined })
    | (CommonProps & { type: 'currency'; value: number | null | undefined });

export function InlineEditCell(props: Props) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // When opening, seed the draft from the current value.
    useEffect(() => {
        if (!editing) return;
        setDraft(props.value == null ? '' : String(props.value));
        setError(null);
        // Focus on next tick so the Input mounts first
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 0);
    }, [editing]);

    const commit = async () => {
        // Parse + validate
        let parsed: string | number | null;
        if (props.type === 'text') {
            parsed = draft.trim() === '' ? null : draft.trim();
        } else {
            const trimmed = draft.trim();
            if (trimmed === '') {
                parsed = null;
            } else {
                const n = Number(trimmed.replace(/[$,\s]/g, ''));
                if (Number.isNaN(n)) {
                    setError('Not a number');
                    return;
                }
                parsed = n;
            }
        }
        if (props.validate) {
            const v = props.validate(parsed);
            if (v) {
                setError(v);
                return;
            }
        }

        // No change — close without writing
        if (parsed === (props.value ?? null)) {
            setEditing(false);
            return;
        }

        setSaving(true);
        try {
            await props.onSave(parsed);
            setEditing(false);
        } catch (err: any) {
            setError(err?.message ?? String(err));
        } finally {
            setSaving(false);
        }
    };

    const cancel = () => {
        setEditing(false);
        setError(null);
    };

    if (props.disabled || !editing) {
        const display = props.value == null
            ? (props.placeholder ?? '—')
            : props.type === 'currency'
                ? formatCurrency(props.value as number)
                : String(props.value);
        return (
            <button
                type="button"
                disabled={props.disabled}
                onClick={() => !props.disabled && setEditing(true)}
                className={cn(
                    'group inline-flex items-center gap-1 text-left w-full',
                    !props.disabled && 'hover:bg-amber-50 hover:ring-1 hover:ring-amber-300 rounded px-1 -mx-1 cursor-text',
                    props.disabled && 'cursor-default opacity-80',
                    props.className,
                )}
                title={props.disabled ? undefined : 'Click to edit'}
            >
                <span>{display}</span>
                {!props.disabled && (
                    <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 text-amber-600 shrink-0" />
                )}
            </button>
        );
    }

    return (
        <div className="relative inline-flex items-center gap-1">
            <Input
                ref={inputRef}
                value={draft}
                onChange={e => { setDraft(e.target.value); setError(null); }}
                onBlur={() => commit()}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(); }
                    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
                }}
                disabled={saving}
                className={cn(
                    'h-7 text-xs rounded border-2 px-2 tabular-nums w-full max-w-[120px]',
                    error && 'border-rose-400 ring-1 ring-rose-200',
                )}
            />
            {saving && <Loader2 className="h-3 w-3 animate-spin text-primary absolute right-2" />}
            {error && (
                <span className="absolute -bottom-4 left-0 text-[9px] font-bold text-rose-600 whitespace-nowrap z-10 bg-white px-1 rounded shadow">
                    {error}
                </span>
            )}
        </div>
    );
}
