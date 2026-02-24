
'use client';

import { useParams } from 'next/navigation';
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc, collection, query, where } from "firebase/firestore";
import { Loader2, ShieldAlert } from "lucide-react";
import ManageOrganisationPage from "@/components/manage-organisation-page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BreadcrumbNav, type BreadcrumbPart } from "@/components/breadcrumb-nav";
import { useMemo } from "react";
import { useCollection } from '@/firebase/firestore/use-collection';

export default function SubDealerManagementPage() {
    const params = useParams();
    const subDealerSlugOrId = params.id as string;
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();
    
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<any>(userProfileRef);
    
    // Fetch the target sub-dealer
    const sdQueryBySlug = useMemoFirebase(() => 
        query(collection(firestore, 'organisations'), where('slug', '==', subDealerSlugOrId)),
    [firestore, subDealerSlugOrId]);
    const { data: sdBySlug, loading: sdSlugLoading } = useCollection<any>(sdQueryBySlug);
    
    const sdByIdRef = useMemoFirebase(() => doc(firestore, 'organisations', subDealerSlugOrId), [firestore, subDealerSlugOrId]);
    const { data: sdById, loading: sdIdLoading } = useDoc<any>(sdByIdRef);

    const subDealer = useMemo(() => sdBySlug?.[0] || sdById, [sdBySlug, sdById]);
    const subDealerLoading = sdSlugLoading || sdIdLoading;

    // Fetch parent organisation for permissions check
    const organisationId = userProfile?.organisationId;
    const orgRef = useMemoFirebase(() => organisationId ? doc(firestore, 'organisations', organisationId) : null, [firestore, organisationId]);
    const { data: parentOrganisation, loading: orgLoading } = useDoc<any>(orgRef);
    
    const isLoading = userLoading || profileLoading || orgLoading || subDealerLoading;

    const hasPermission = useMemo(() => {
        if (isLoading) return true;
        if (userProfile?.appRole === 'HelmLogic Admin') return true;
        
        // Check if user belongs to the parent organisation
        if (subDealer?.parentOrganisationId !== organisationId) return false;

        const roleId = userProfile?.organisationRole;
        if (!roleId || !parentOrganisation?.permissions?.[roleId]) return false;
        return !!parentOrganisation.permissions[roleId].can_view_subdealers;
    }, [userProfile, parentOrganisation, subDealer, organisationId, isLoading]);

    const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!subDealer) return [];
        return [
            { href: '/sub-dealers', label: 'Sub Dealers' },
            { href: `/sub-dealers/${subDealer.slug || subDealer.id}`, label: subDealer.name },
        ];
    }, [subDealer]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">Manage Sub Dealer</h1>
                    <BreadcrumbNav />
                </div>
                <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
            </div>
        );
    }

    if (!hasPermission || !subDealer) {
        return (
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">Manage Sub Dealer</h1>
                    <BreadcrumbNav />
                </div>
                <Card className="border-destructive/50">
                    <CardHeader>
                        <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-6 w-6" />
                            <CardTitle>Access Denied</CardTitle>
                        </div>
                        <CardDescription>You do not have permission to manage this sub dealer.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Please contact your administrator if you believe this is an error.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Manage Sub Dealer: {subDealer.name}</h1>
                <BreadcrumbNav parts={breadcrumbParts} />
            </div>
            <ManageOrganisationPage orgId={subDealer.id} />
        </div>
    );
}
