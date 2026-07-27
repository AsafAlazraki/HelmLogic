'use client';

/**
 * v1.34 — the FULL-SCREEN motor editor (Asaf: "full dedicated screen
 * like the one for boat catalog", not a popup).
 *
 * Route: /modules/{moduleSlugOrId}/motor/{motorId}[?vendor=&set=]
 * vendor/set are optional — they resolve from the module's mainVendorId
 * and the standard dataset-discovery heuristic when absent, so links
 * stay simple. The motor doc is a LIVE subscription: every save renders
 * back immediately, and the panels write through the shared
 * writeFieldsFor mirrors — the exact MPF row every quote surface reads.
 */

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Loader2, ChevronLeft, Anchor } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency-utils';
import { MotorEditorPanels, writeFieldsFor } from '@/components/motors-table-view';

export default function MotorEditorPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const router = useRouter();
    const { user } = useUser();
    const { toast } = useToast();

    const slugOrId = params.id as string;
    const motorId = params.motorId as string;

    // Module by slug OR id (same pattern as the quote pages).
    const moduleQueryBySlug = useMemoFirebase(
        () => (slugOrId ? query(collection(firestore, 'modules'), where('slug', '==', slugOrId)) : null),
        [firestore, slugOrId],
    );
    const { data: modulesBySlug, isLoading: slugLoading } = useCollection<any>(moduleQueryBySlug);
    const moduleByIdRef = useMemoFirebase(
        () => (slugOrId ? doc(firestore, 'modules', slugOrId) : null),
        [firestore, slugOrId],
    );
    const { data: moduleById, isLoading: idLoading } = useDoc<any>(moduleByIdRef);
    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);

    // vendor/set from the URL, else resolved from the module.
    const vendorId = searchParams.get('vendor') || moduleData?.mainVendorId || null;
    const [dataSetId, setDataSetId] = useState<string | null>(searchParams.get('set'));
    useEffect(() => {
        if (dataSetId || !vendorId) return;
        let cancelled = false;
        (async () => {
            try {
                const dsSnap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'dataSets'));
                if (cancelled) return;
                const datasets = dsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                const preferred = datasets.find((s: any) =>
                    String(s.name || '').toLowerCase().match(/outboard|motor|library|engine/)) || datasets[0];
                if (preferred) setDataSetId(preferred.id);
            } catch (err) {
                console.error('dataset discovery failed', err);
            }
        })();
        return () => { cancelled = true; };
    }, [dataSetId, vendorId, firestore]);

    // LIVE motor row — saves render back immediately.
    const motorRef = useMemoFirebase(
        () => (vendorId && dataSetId && motorId
            ? doc(firestore, `data-warehouse/${vendorId}/dataSets/${dataSetId}/rows`, motorId)
            : null),
        [firestore, vendorId, dataSetId, motorId],
    );
    const { data: motorDoc, loading: motorLoading } = useDoc<any>(motorRef);
    const motor = useMemo(() => (motorDoc ? { id: motorId, ...motorDoc } : null), [motorDoc, motorId]);

    // Org id for the catalogue pickers.
    const userProfileRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
    const { data: userProfile } = useDoc<any>(userProfileRef);
    const orgId = userProfile?.organisationId ?? null;

    const patchMotor = async (id: string, field: string, next: any) => {
        if (!vendorId || !dataSetId) return;
        try {
            await updateDoc(
                doc(firestore, 'data-warehouse', vendorId, 'dataSets', dataSetId, 'rows', id),
                { ...writeFieldsFor(field, next), updatedAt: serverTimestamp() },
            );
            toast({ title: 'Saved', description: 'Live on every quote surface.' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
            throw err;
        }
    };

    const name = motor?.['Model Name'] || motor?.['MODEL'] || motor?.name || 'Motor';
    const code = motor?.['Part Number'] || motor?.['MODEL CODE'] || null;
    const hp = motor?.['HP Rating'] ?? null;
    const sell = [motor?.priceLevels?.hull_cash, motor?.['NSM Retail'], motor?.sellPriceExclGst]
        .find(v => typeof v === 'number' && v > 0) ?? null;
    const image = motor?.imageUrl || motor?.SummaryImage || null;

    const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!moduleData || !motor) return [];
        return [
            { href: '/dashboard', label: 'Dashboard' },
            { href: `/modules/${moduleData.slug || moduleData.id}`, label: moduleData.name },
            { href: '#', label: name },
        ];
    }, [moduleData, motor, name]);

    if (slugLoading || idLoading || motorLoading || (!dataSetId && vendorId)) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    if (!moduleData || !motor) {
        return (
            <div className="p-12 text-center">
                <h2 className="text-xl font-bold">Motor or Module Not Found</h2>
                <Button variant="link" onClick={() => router.back()}>Go Back</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Header band — photo, identity, price chips, back */}
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Anchor className="h-5 w-5 text-primary shrink-0" />
                        <h1 className="text-2xl font-black uppercase tracking-tight truncate">{name}</h1>
                        {code && <Badge variant="outline" className="font-mono text-[10px]">{code}</Badge>}
                        {hp != null && <Badge variant="secondary" className="text-[10px] font-black uppercase">{String(hp)} HP</Badge>}
                        {sell != null && <Badge className="text-[10px] font-black">{formatCurrency(sell)}</Badge>}
                    </div>
                    <BreadcrumbNav parts={breadcrumbParts} />
                </div>
                <Button variant="outline" size="sm" onClick={() => router.push(`/modules/${moduleData.slug || moduleData.id}`)} className="font-bold shrink-0">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back to Module
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
                {/* Left rail: photo + provenance */}
                <div className="space-y-4 lg:sticky lg:top-6">
                    <div className="rounded-2xl border-2 bg-white shadow-sm h-64 flex items-center justify-center overflow-hidden">
                        {image ? (
                            <img src={image} alt={name} className="h-full w-full object-contain p-4 mix-blend-multiply" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                            <Anchor className="h-16 w-16 text-slate-200" />
                        )}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed px-1">
                        Everything about this motor in one place. Edits save on blur and update every mirror
                        (quote flow, workspace, exports). The next Master Price File import wins.
                    </p>
                </div>

                {/* Main: the shared define-everything panels */}
                <div className="rounded-2xl border-2 bg-white shadow-sm px-6">
                    <MotorEditorPanels motor={motor} onPatch={patchMotor} organisationId={orgId} />
                </div>
            </div>
        </div>
    );
}
