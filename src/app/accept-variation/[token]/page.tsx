'use client';

/**
 * Customer accept-variation page (v1.20 — Story 2.6.3).
 *
 * Public route. No login required. Customer hits the link from their
 * variation email, sees the delta lines, signs on a canvas, accepts.
 *
 * Storage write target:
 *   users/{ownerUid}/quotes/{qid}/variations/{vid}.acceptedAt + signature
 *
 * Lookup: scan every signed-in user's quotes for a variation whose
 * publicAcceptToken matches AND publicAcceptTokenConsumed === false.
 * Since this is a public page with no auth, the security model is:
 *   - Token is unguessable (32-hex random per variation).
 *   - Token marked consumed on first accept.
 *   - Firestore rules require signed-in for write, so the page uses
 *     anonymous auth (signInAnonymously) so the public page works
 *     without a server endpoint. Production hardening: move the write
 *     to a Cloud Function in v1.21.
 *
 * Wrapped in FirebaseClientProvider so useFirestore() resolves outside
 * the (app) layout. Same pattern as src/app/login/page.tsx +
 * src/app/signup/page.tsx.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { collectionGroup, getDocs, query, where, doc, updateDoc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { signInAnonymously, getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, AlertCircle, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface VariationLookup {
    docRef: any;
    data: any;
}

function AcceptVariationContent() {
    const params = useParams();
    const tokenRaw = (params?.token ?? '') as string;
    const token = String(tokenRaw).trim();
    const firestore = useFirestore();

    const [stage, setStage] = useState<'loading' | 'invalid' | 'consumed' | 'ready' | 'signed' | 'submitting' | 'error'>('loading');
    const [variation, setVariation] = useState<VariationLookup | null>(null);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!token) {
                setStage('invalid');
                return;
            }
            try {
                // Sign in anonymously so we can read the variations collection
                // group under the parent quote rules.
                const auth = getAuth();
                if (!auth.currentUser) await signInAnonymously(auth);
                const q = query(collectionGroup(firestore, 'variations'), where('publicAcceptToken', '==', token));
                const snap = await getDocs(q);
                if (cancelled) return;
                if (snap.empty) {
                    setStage('invalid');
                    return;
                }
                const docRef = snap.docs[0].ref;
                const data = snap.docs[0].data() as any;
                if (data.publicAcceptTokenConsumed) {
                    setVariation({ docRef, data });
                    setStage('consumed');
                    return;
                }
                setVariation({ docRef, data });
                setStage('ready');
            } catch (err: any) {
                console.error(err);
                if (!cancelled) {
                    setError(err?.message ?? String(err));
                    setStage('error');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [firestore, token]);

    const startDraw = (e: any) => {
        drawingRef.current = true;
        const c = canvasRef.current;
        if (!c) return;
        const rect = c.getBoundingClientRect();
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.beginPath();
        ctx.moveTo((e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left, (e.clientY ?? e.touches?.[0]?.clientY ?? 0) - rect.top);
    };
    const moveDraw = (e: any) => {
        if (!drawingRef.current) return;
        const c = canvasRef.current;
        if (!c) return;
        const rect = c.getBoundingClientRect();
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.lineTo((e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left, (e.clientY ?? e.touches?.[0]?.clientY ?? 0) - rect.top);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#0c2a4d';
        ctx.stroke();
    };
    const endDraw = () => {
        drawingRef.current = false;
    };
    const clearSignature = () => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, c.width, c.height);
    };

    const handleAccept = async () => {
        if (!variation || !canvasRef.current) return;
        if (!name.trim()) {
            setError('Please enter your name.');
            return;
        }
        const ctx = canvasRef.current.getContext('2d');
        const blank = !ctx || ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height).data.every((v, i) => i % 4 === 3 ? v === 0 : true);
        if (blank) {
            setError('Please sign in the box before submitting.');
            return;
        }
        setStage('submitting');
        setError(null);
        try {
            const signatureDataUrl = canvasRef.current.toDataURL('image/png');
            await updateDoc(variation.docRef, {
                status: 'accepted',
                acceptedAt: new Date(),
                acceptedByName: name.trim(),
                acceptedSignatureDataUrl: signatureDataUrl,
                acceptedUserAgent: navigator.userAgent,
                publicAcceptTokenConsumed: true,
            });
            setStage('signed');
        } catch (err: any) {
            console.error(err);
            setError(err?.message ?? String(err));
            setStage('error');
        }
    };

    const totalDelta = useMemo(() => {
        if (!variation) return 0;
        return Number(variation.data.totalDeltaExclGst ?? 0);
    }, [variation]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-8 flex items-center justify-center" data-testid="accept-variation-page">
            <Card className="max-w-lg w-full shadow-2xl border-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <GitBranch className="h-5 w-5 text-primary" />
                        Variation agreement
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Sign below to accept the variation to your quote.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {stage === 'loading' && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading variation…
                        </div>
                    )}
                    {stage === 'invalid' && (
                        <div className="flex items-center gap-2 text-sm text-rose-700 py-8 justify-center">
                            <AlertCircle className="h-4 w-4" /> Variation link not valid. Please ask your dealer for a fresh link.
                        </div>
                    )}
                    {stage === 'consumed' && (
                        <div className="flex items-center gap-2 text-sm text-emerald-700 py-8 justify-center">
                            <CheckCircle2 className="h-4 w-4" /> This variation has already been accepted. Thank you.
                        </div>
                    )}
                    {stage === 'error' && (
                        <div className="text-sm text-rose-700 py-4">
                            <p className="font-bold">Something went wrong.</p>
                            <p className="text-xs">{error}</p>
                        </div>
                    )}
                    {(stage === 'ready' || stage === 'submitting') && variation && (
                        <>
                            <div className="rounded-xl border-2 p-3 space-y-2">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Variation {variation.data.variationNumber}</p>
                                <p className="font-bold text-sm">{variation.data.title}</p>
                                {variation.data.customerMessage && <p className="text-xs italic text-muted-foreground">{variation.data.customerMessage}</p>}
                            </div>
                            <div className="space-y-1.5">
                                {(variation.data.lines ?? []).map((line: any) => (
                                    <div key={line.id} className="flex items-center justify-between text-xs border-b py-1.5">
                                        <span className="truncate">{line.kind === 'remove' ? '−' : line.kind === 'add' ? '+' : '~'} {line.label}</span>
                                        <span className="font-bold tabular-nums">{Number(line.deltaExclGst) >= 0 ? '+' : ''}${Number(line.deltaExclGst).toLocaleString('en-AU')}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="rounded-xl border-2 p-3 bg-slate-50 flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Total delta ex GST</p>
                                <p className={`font-black ${totalDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'} tabular-nums`}>
                                    {totalDelta >= 0 ? '+' : ''}${totalDelta.toLocaleString('en-AU')}
                                </p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Your name</Label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Signature</Label>
                                    <Button size="sm" variant="ghost" onClick={clearSignature} className="h-6 px-2 text-[10px]">Clear</Button>
                                </div>
                                <canvas
                                    ref={canvasRef}
                                    width={460}
                                    height={120}
                                    onMouseDown={startDraw}
                                    onMouseMove={moveDraw}
                                    onMouseUp={endDraw}
                                    onMouseLeave={endDraw}
                                    onTouchStart={startDraw}
                                    onTouchMove={moveDraw}
                                    onTouchEnd={endDraw}
                                    className="border-2 rounded-xl bg-white w-full touch-none"
                                    data-testid="signature-canvas"
                                />
                            </div>
                            {error && <p className="text-xs text-rose-700">{error}</p>}
                            <Button onClick={handleAccept} disabled={stage === 'submitting'} className="w-full" data-testid="accept-variation-submit">
                                {stage === 'submitting' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                Accept variation
                            </Button>
                        </>
                    )}
                    {stage === 'signed' && (
                        <div className="text-center py-8">
                            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
                            <p className="font-bold">Thank you, {name}.</p>
                            <p className="text-xs text-muted-foreground mt-2">Your dealer has been notified.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function AcceptVariationPage() {
    return (
        <FirebaseClientProvider>
            <AcceptVariationContent />
        </FirebaseClientProvider>
    );
}
