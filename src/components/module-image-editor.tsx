'use client';

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImagePlus, Link2, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';

interface ModuleImageEditorProps {
    moduleId: string;
    currentLogoUrl?: string;
    isAdmin: boolean;
    title?: string;
    description?: string;
}

/**
 * Reusable editor for a module's `logoUrl` — appears as a standard Card in
 * any module's Settings tab. Supports file upload, paste-URL, and remove.
 */
export function ModuleImageEditor({
    moduleId,
    currentLogoUrl,
    isAdmin,
    title = 'Module Image',
    description = 'Logo or banner shown on the module card and throughout the workspace.',
}: ModuleImageEditorProps) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();

    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState<'idle' | 'url'>('idle');
    const [urlInput, setUrlInput] = useState('');

    async function persist(url: string | null) {
        const ref = doc(firestore, 'modules', moduleId);
        try {
            await updateDoc(ref, { logoUrl: url ?? '' });
            toast({ title: url ? 'Module image updated' : 'Module image removed' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to update image', description: e.message });
            throw e;
        }
    }

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        try {
            const path = `modules/${moduleId}/logo-${Date.now()}-${file.name}`;
            const url = await uploadFileToStorage(storage, file, path);
            await persist(url);
        } catch { /* toast handled in persist */ }
        finally { setBusy(false); }
    }

    async function handleSaveUrl() {
        const trimmed = urlInput.trim();
        if (!trimmed) return;
        setBusy(true);
        try {
            await persist(trimmed);
            setMode('idle');
            setUrlInput('');
        } catch { /* toast handled in persist */ }
        finally { setBusy(false); }
    }

    async function handleRemove() {
        setBusy(true);
        try { await persist(null); } catch { /* toast handled in persist */ }
        finally { setBusy(false); }
    }

    return (
        <Card className="border-2 rounded-2xl">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border-2 border-primary/20">
                        <ImageIcon className="h-5 w-5" />
                    </div>
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex items-start gap-4 flex-wrap">
                    <div className="relative h-28 w-48 bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden border-2 shrink-0">
                        {currentLogoUrl ? (
                            <img src={currentLogoUrl} alt="Module" className="h-full w-full object-contain p-2" />
                        ) : (
                            <ImageIcon className="h-10 w-10 text-slate-300" />
                        )}
                        {busy && (
                            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-[200px] space-y-2">
                        {!isAdmin ? (
                            <p className="text-xs text-slate-400 italic">
                                Admin role required to edit the module image.
                            </p>
                        ) : mode === 'idle' ? (
                            <div className="flex gap-2 flex-wrap">
                                <Button variant="outline" size="sm" disabled={busy}
                                    onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.click()}>
                                    <ImagePlus className="h-3 w-3 mr-1" />
                                    {currentLogoUrl ? 'Replace' : 'Upload'}
                                </Button>
                                <input type="file" accept="image/*" hidden onChange={handleFile} />
                                <Button variant="outline" size="sm" disabled={busy}
                                    onClick={() => { setMode('url'); setUrlInput(currentLogoUrl || ''); }}>
                                    <Link2 className="h-3 w-3 mr-1" /> Paste URL
                                </Button>
                                {currentLogoUrl && (
                                    <Button variant="outline" size="sm"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        disabled={busy} onClick={handleRemove}>
                                        <Trash2 className="h-3 w-3 mr-1" /> Remove
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <Input
                                    autoFocus
                                    placeholder="https://example.com/logo.png"
                                    value={urlInput}
                                    onChange={(e) => setUrlInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveUrl();
                                        else if (e.key === 'Escape') { setMode('idle'); setUrlInput(''); }
                                    }}
                                    className="flex-1"
                                />
                                <Button size="sm" disabled={busy || !urlInput.trim()} onClick={handleSaveUrl}>
                                    Save
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => { setMode('idle'); setUrlInput(''); }}>
                                    Cancel
                                </Button>
                            </div>
                        )}
                        <p className="text-[10px] text-slate-400">
                            PNG or JPG recommended. Transparent backgrounds preferred for logos.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
