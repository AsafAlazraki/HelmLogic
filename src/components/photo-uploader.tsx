'use client';

/**
 * Photo Uploader (v1.7 — story 1.8.2 single-image variant).
 *
 * Single-image upload for surfaces that need ONE photo (e.g.
 * salesperson profile photo for 1.8.12). Distinct from the v1.5
 * FeatureImageUploader which handles multi-image arrays.
 *
 * Renders the current photo (if any) with replace/remove controls,
 * or an upload CTA when empty. Uploads to a caller-provided
 * storage path; persistence of the resulting URL is the parent's
 * job (we just emit it via onChange).
 *
 * v1.5 lesson applied: shadcn `<Input type="file">` + `<label>`
 * binding doesn't fire reliably (the Input wrapper div breaks
 * label-for-input). We use a native hidden `<input type="file">`
 * triggered by Button onClick instead. Reset `e.target.value` after
 * upload so re-selecting the same file works.
 */

import { useRef, useState } from 'react';
import { useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    /** Current photo URL (null = empty state). */
    value: string | null | undefined;
    /** Called with the new URL after successful upload, or null on remove. */
    onChange: (url: string | null) => void;
    /** Storage path prefix — uploader appends a timestamped filename.
     *  Example: "salesTeam/{orgId}/{userId}" → final path
     *  "salesTeam/{orgId}/{userId}/{timestamp}-{rand}-{filename}". */
    storagePathPrefix: string;
    /** Optional accept filter (default image/*). */
    accept?: string;
    /** Sizing variants for the preview box. */
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const SIZES = {
    sm: 'h-20 w-20',
    md: 'h-32 w-32',
    lg: 'h-48 w-48',
};

export function PhotoUploader({ value, onChange, storagePathPrefix, accept = 'image/*', size = 'md', className }: Props) {
    const storage = useStorage();
    const { toast } = useToast();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [busy, setBusy] = useState(false);

    function handlePick() {
        inputRef.current?.click();
    }

    async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-pick
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Not an image', description: 'Please pick an image file.' });
            return;
        }
        setBusy(true);
        try {
            const path = `${storagePathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
            const url = await uploadFileToStorage(storage, file, path);
            onChange(url);
            toast({ title: 'Photo uploaded' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Upload failed', description: e?.message ?? 'See console.' });
            console.error('[photo-uploader]', e);
        } finally {
            setBusy(false);
        }
    }

    function handleRemove() {
        onChange(null);
    }

    return (
        <div className={cn('flex items-center gap-3', className)}>
            {/* Preview box */}
            <div className={cn('relative rounded-lg border-2 overflow-hidden bg-slate-50 flex items-center justify-center shrink-0', SIZES[size])}>
                {value ? (
                    // Native <img> — Next/Image with external URLs has CORS issues per CLAUDE.md
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={value} alt="Photo" className="w-full h-full object-cover" />
                ) : (
                    <Camera className="h-8 w-8 text-slate-300" />
                )}
                {busy && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={handlePick} disabled={busy} className="gap-1.5 justify-start">
                    <Upload className="h-3.5 w-3.5" />
                    {value ? 'Replace photo' : 'Upload photo'}
                </Button>
                {value && (
                    <Button size="sm" variant="ghost" onClick={handleRemove} disabled={busy} className="gap-1.5 justify-start text-slate-500 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                    </Button>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    onChange={handleChange}
                    className="hidden"
                />
            </div>
        </div>
    );
}
