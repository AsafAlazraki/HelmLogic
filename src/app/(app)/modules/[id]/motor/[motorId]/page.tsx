'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, ChevronLeft, Wrench, ShieldCheck, Globe, DollarSign } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MotorConfigurationDetails } from '@/components/motor-configuration-details';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export default function MotorConfigurationPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const router = useRouter();

    const moduleSlug = params.id as string;
    const motorId = params.motorId as string;
    const vendorId = searchParams.get('vendor');
    const dataSetId = searchParams.get('set');

    const moduleRef = useMemoFirebase(() => doc(firestore, 'modules', moduleSlug), [firestore, moduleSlug]);
    const { data: moduleData, loading: moduleLoading } = useDoc<any>(moduleRef);

    const [motor, setMotor] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMotor = async () => {
            if (!vendorId || !dataSetId || !motorId) return;
            setLoading(true);
            try {
                const motorRef = doc(firestore, `data-warehouse/${vendorId}/dataSets/${dataSetId}/rows`, motorId);
                const snap = await getDoc(motorRef).catch(async (e) => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: motorRef.path,
                        operation: 'get'
                    } satisfies SecurityRuleContext));
                    throw e;
                });
                if (snap.exists()) {
                    setMotor({ id: snap.id, ...snap.data() });
                }
            } catch (e) {
                console.error("Failed to fetch motor", e);
            } finally {
                setLoading(false);
            }
        };
        fetchMotor();
    }, [firestore, vendorId, dataSetId, motorId]);

    const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!moduleData || !motor) return [];
        return [
            { href: "/dashboard", label: "Dashboard" },
            { href: `/modules/${moduleSlug}`, label: moduleData.name },
            { href: "#", label: motor['Model Name'] || motor.name || 'Configuration' },
        ];
    }, [moduleData, motor, moduleSlug]);

    if (moduleLoading || loading) {
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
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div className="min-w-0">
                    <h1 className="text-2xl font-black uppercase tracking-tight">{motor['Model Name'] || motor.name}</h1>
                    <BreadcrumbNav parts={breadcrumbParts} />
                </div>
                <Button variant="outline" size="sm" onClick={() => router.back()} className="font-bold">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back to Module
                </Button>
            </div>

            <MotorConfigurationDetails 
                motor={motor} 
                module={moduleData} 
                vendorId={vendorId!} 
                dataSetId={dataSetId!} 
            />
        </div>
    );
}
