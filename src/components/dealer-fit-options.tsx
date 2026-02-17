
'use client';

import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JsonDataVisualizer } from './json-data-visualizer';

interface Vendor {
    id: string;
    name: string;
    vendorType: string;
}

function VendorDataSet({ vendorId }: { vendorId: string }) {
    const { data, loading } = useCollection(`data-warehouse/${vendorId}/masterDataSet`);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    return <JsonDataVisualizer data={data} />;
}

export function DealerFitOptions({ module }: { module: any }) {
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');

    const dealerFitVendors = useMemo(() => {
        if (!allVendors || !module || !module.associatedVendorIds) return [];

        return allVendors.filter(v =>
            module.associatedVendorIds.includes(v.id) &&
            v.vendorType !== 'Motor Brand'
        );
    }, [allVendors, module]);
    
    if (vendorsLoading) {
        return (
            <Card>
                <CardContent className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </CardContent>
            </Card>
        );
    }

    if (dealerFitVendors.length === 0) {
        return (
            <Card>
                <CardContent className="flex h-64 flex-col items-center justify-center text-center">
                    <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No Dealer Fit Vendors Associated</p>
                    <p className="text-sm text-muted-foreground">
                        Associate non-motor-brand vendors with this module in the module settings.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Dealer Fit Options</CardTitle>
                <CardDescription>
                    Browse data from associated vendors to add as dealer-fitted options.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue={dealerFitVendors[0].id} className="w-full">
                    <TabsList>
                        {dealerFitVendors.map(vendor => (
                            <TabsTrigger key={vendor.id} value={vendor.id}>
                                {vendor.name}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {dealerFitVendors.map(vendor => (
                        <TabsContent key={vendor.id} value={vendor.id} className="mt-4">
                            <VendorDataSet vendorId={vendor.id} />
                        </TabsContent>
                    ))}
                </Tabs>
            </CardContent>
        </Card>
    );
}
    