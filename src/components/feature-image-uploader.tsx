'use client';

/**
 * Multi-image uploader for v1.5 Feature Tracking.
 *
 * Uploads files to Firebase Storage under `features/{featureId}/` and
 * returns the resulting download URLs. Stores the URL list on the
 * feature doc's `imageUrls` field. Also supports adding by pasted URL
 * (for users who have an image hosted elsewhere already) and removing
 * individual uploads.
 */

import { useState } from 'react';
import { useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImagePlus, Link2, Loader2, Trash2, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureImageUploaderProps {
    featureId: string;
    value: string[];
    onChange: (urls: string[]) => void;
    maxImages?: number;
}

export function FeatureImageUploader({
    featureId,
    value,
    onChange,
    maxImages = 10,
}: FeatureImageUploaderProps) {
    const storage = useStorage();
    const { toast } = useToast();
    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState<'idle' | 'url'>('idle');
    const [urlDraft, setUrlDraft] = useState('');

    const remaining = Math.max(0, maxImages - value.length);

    async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        e.target.value = ''; // allow re-selecting the same file
        if (files.length === 0) return;

        const accepted = files.slice(0, remaining);
        if (accepted.length < files.length) {
            toast({
                variant: 'destructive',
                title: 'Limit reached',
                description: `Only ${accepted.length} of ${files.length} uploaded (max ${maxImages}).`,
            });
        }

        setBusy(true);
        const newUrls: string[] = [];
        try {
            for (const file of accepted) {
                const path = `features/${featureId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
                try {
                    const url = await uploadFileToStorage(storage, file, path);
                    newUrls.push(url);
                } catch (err: any) {
                    toast({
                        variant: 'destructive',
                        title: `Failed to upload ${file.name}`,
                        description: err?.message ?? 'See console.',
                    });
                }
            }
            if (newUrls.length > 0) {
                onChange([...value, ...newUrls]);
                toast({ title: `${newUrls.length} image${newUrls.length === 1 ? '' : 's'} uploaded` });
            }
        } finally {
            setBusy(false);
        }
    }

    function handleAddUrl() {
        const trimmed = urlDraft.trim();
        if (!trimmed) return;
        if (value.length >= maxImages) {
            toast({ variant: 'destructive', title: 'Limit reached', description: `Max ${maxImages} images.` });
            return;
        }
        onChange([...value, trimmed]);
        setUrlDraft('');
        setMode('idle');
    }

    function handleRemove(idx: number) {
        const next = [...value];
        next.splice(idx, 1);
        onChange(next);
    }

    return (
        <div className="space-y-2">
            {value.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {value.map((url, idx) => (
                        <div
                            key={`${url}-${idx}`}
                            className="group relative aspect-square rounded-md border overflow-hidden bg-slate-50"
                        >
                            <img
                                src={url}
                                alt={`Feature image ${idx + 1}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => handleRemove(idx)}
                                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white/90 border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-red-600 hover:text-red-700"
                                title="Remove"
                            >
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {mode === 'idle' ? (
                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || remaining === 0}
                        onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.click()}
                    >
                        {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ImagePlus className="h-3 w-3 mr-1" />}
                        Upload {value.length > 0 ? 'more' : 'images'}
                    </Button>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={handleFiles}
                        disabled={busy || remaining === 0}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || remaining === 0}
                        onClick={() => setMode('url')}
                    >
                        <Link2 className="h-3 w-3 mr-1" /> Paste URL
                    </Button>
                    <span className="text-[10px] text-slate-400">
                        {value.length > 0 ? `${value.length} / ${maxImages}` : remaining === 0 ? 'Max reached' : ''}
                    </span>
                </div>
            ) : (
                <div className="flex items-center gap-1">
                    <Input
                        autoFocus
                        value={urlDraft}
                        onChange={(e) => setUrlDraft(e.target.value)}
                        placeholder="https://example.com/screenshot.png"
                        className="h-8 text-xs"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); }
                            if (e.key === 'Escape') { setMode('idle'); setUrlDraft(''); }
                        }}
                    />
                    <Button size="sm" className="h-8" onClick={handleAddUrl} disabled={!urlDraft.trim()}>
                        Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { setMode('idle'); setUrlDraft(''); }}>
                        Cancel
                    </Button>
                </div>
            )}

            {value.length === 0 && (
                <p className="text-[10px] text-slate-400 italic flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    No images yet. PNG, JPG or paste a URL.
                </p>
            )}
        </div>
    );
}
