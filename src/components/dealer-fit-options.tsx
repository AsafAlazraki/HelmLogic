
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JsonDataVisualizer } from './json-data-visualizer';

interface Vendor {
    id: string;
    name: string;
    vendorType: string;
    slug?: string;
}

interface Organisation {
    id: string;
    moduleAssociatedVendorAccess?: Record<string, string[]>;
}

function VendorDataSet({ vendorId, vendorSlug }: { vendorId: string, vendorSlug?: string }) {
    // Standardize collection name for Sam Allen vs others
    const collectionName = vendorSlug === 'sam-allen' ? 'masterPriceList' : 'masterDataSet';
    const { data, loading } = useCollection(`data-warehouse/${vendorId}/${collectionName}`);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    return <JsonDataVisualizer data={data} />;
}

export function DealerFitOptions({ module, organisationId }: { module: any, organisationId?: string }) {
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(organisationId ? `/organisations/${organisationId}` : null);

    const dealerFitVendors = useMemo(() => {
        if (!allVendors || !module || !module.associatedVendorIds) return [];

        // 1. Identify all non-motor-brand associated vendors for this module
        const potentialVendors = allVendors.filter(v =>
            module.associatedVendorIds.includes(v.id) &&
            v.vendorType !== 'Motor Brand'
        );

        // 2. If an organisationId is provided, filter based on their moduleAssociatedVendorAccess
        // Helmlogic Admins (no organisationId passed or no org found) see everything.
        if (organisationId && organisation) {
            const allowedVendorIds = organisation.moduleAssociatedVendorAccess?.[module.id] || [];
            
            return potentialVendors.filter(v => 
                // Organizations always see the main vendor if it's in the list
                v.id === module.mainVendorId || 
                // Or if it's explicitly allowed
                allowedVendorIds.includes(v.id)
            );
        }

        return potentialVendors;
    }, [allVendors, module, organisation, organisationId]);
    
    if (vendorsLoading || orgLoading) {
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
                    <p className="mt-4 font-semibold">No Dealer Fit Vendors Available</p>
                    <p className="text-sm text-muted-foreground">
                        {organisationId 
                            ? "No additional associated vendors have been enabled for your organisation in this module." 
                            : "Associate non-motor-brand vendors with this module in the module settings."
                        }
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
                    <TabsList className="flex-wrap h-auto">
                        {dealerFitVendors.map(vendor => (
                            <TabsTrigger key={vendor.id} value={vendor.id} className="min-w-[100px]">
                                {vendor.name}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {dealerFitVendors.map(vendor => (
                        <TabsContent key={vendor.id} value={vendor.id} className="mt-4">
                            <VendorDataSet vendorId={vendor.id} vendorSlug={vendor.slug} />
                        </TabsContent>
                    ))}
                </Tabs>
            </CardContent>
        </Card>
    );
}
