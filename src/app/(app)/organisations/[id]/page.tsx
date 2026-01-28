'use client';

import { useParams } from 'next/navigation';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import AdminGuard from '@/components/admin-guard';

interface Organisation {
    name: string;
    address?: string;
    phoneNumber?: string;
    abn?: string;
    primaryColor?: string;
}

export default function OrganisationDetailsPage() {
    const params = useParams();
    const { id } = params;

    const { data: organisation, loading } = useDoc<Organisation>(id ? `organisations/${id}` : null);

    return (
        <AdminGuard>
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">{loading ? 'Loading...' : organisation?.name || 'Organisation Details'}</h1>
                    <BreadcrumbNav />
                </div>
                
                {loading ? (
                    <div className="flex justify-center items-center py-24">
                        <Loader2 className="h-16 w-16 animate-spin text-primary" />
                    </div>
                ) : organisation ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>{organisation.name}</CardTitle>
                            <CardDescription>Details for this organisation.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p><span className="font-semibold">Address:</span> {organisation.address || 'N/A'}</p>
                            <p><span className="font-semibold">Phone:</span> {organisation.phoneNumber || 'N/A'}</p>
                            <p><span className="font-semibold">ABN:</span> {organisation.abn || 'N/A'}</p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Organisation not found</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>The requested organisation could not be found.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AdminGuard>
    );
}
