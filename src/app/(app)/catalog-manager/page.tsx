'use client';

/**
 * Catalog Manager page (v1.11 — Story 3.7.1).
 *
 * Top-level read/edit surface that gathers the org's catalogue
 * subsystems behind a single 3-tab switcher (Boats / Fit-Up /
 * Service) + a global Export/Import card pinned at the top. Sits
 * alongside Pricing Manager which is now positioned as the
 * "pricing-rules + margins" surface; Catalog Manager is the
 * "what items exist" surface. Pricing Manager has a sibling tab
 * pointing here so operators can swap views without losing context.
 */

import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { doc } from 'firebase/firestore';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { HelmLogicLoading } from '@/components/helmlogic-loading';
import { CatalogExportImport } from '@/components/catalog-export-import';
import { BoatsTableView } from '@/components/boats-table-view';
import { MotorsTableView } from '@/components/motors-table-view';
import { FitUpCatalogManager } from '@/components/fit-up-catalog-manager';
import { ServiceCatalogManager } from '@/components/service-catalog-manager';
import { useState } from 'react';

interface UserProfile {
    organisationId?: string;
    organisationRole?: string;
    appRole?: string;
}

interface Organisation {
    id: string;
    permissions?: Record<string, Record<string, boolean>>;
}

export default function CatalogManagerPage() {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();
    const [activeTab, setActiveTab] = useState<string>('boats');

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(userProfileRef);
    const orgRef = useMemoFirebase(
        () => userProfile?.organisationId ? doc(firestore, 'organisations', userProfile.organisationId) : null,
        [firestore, userProfile],
    );
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(orgRef);

    const isLoading = userLoading || profileLoading || orgLoading;

    if (isLoading) return <HelmLogicLoading label="Synchronising Catalogue" />;

    if (!userProfile?.organisationId) {
        return (
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">Catalog Manager</h1>
                    <BreadcrumbNav />
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>No Organisation Found</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>You are not currently a member of any organisation.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Permission gate — catalogue editing is org-admin (same as /manage).
    const hasPermission = (() => {
        if (userProfile.appRole === 'HelmLogic Admin') return true;
        const roleId = userProfile.organisationRole;
        if (!roleId || !organisation?.permissions?.[roleId]) return false;
        return !!organisation.permissions[roleId].can_access_settings;
    })();

    if (!hasPermission) {
        return (
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">Catalog Manager</h1>
                    <BreadcrumbNav />
                </div>
                <Card className="border-destructive/50">
                    <CardHeader>
                        <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-6 w-6" />
                            <CardTitle>Access Denied</CardTitle>
                        </div>
                        <CardDescription>You do not have permission to manage catalogues.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    const orgId = userProfile.organisationId;

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Catalog Manager</h1>
                <BreadcrumbNav />
            </div>

            <CatalogExportImport organisationId={orgId} />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="boats">Boats</TabsTrigger>
                    <TabsTrigger value="motors">Motors</TabsTrigger>
                    <TabsTrigger value="fit-up">Fit-Up</TabsTrigger>
                    <TabsTrigger value="service">Service</TabsTrigger>
                </TabsList>

                <TabsContent value="boats">
                    {activeTab === 'boats' && <BoatsTableView />}
                </TabsContent>
                <TabsContent value="motors">
                    {activeTab === 'motors' && <MotorsTableView />}
                </TabsContent>
                <TabsContent value="fit-up">
                    {activeTab === 'fit-up' && <FitUpCatalogManager organisationId={orgId} />}
                </TabsContent>
                <TabsContent value="service">
                    {activeTab === 'service' && <ServiceCatalogManager organisationId={orgId} />}
                </TabsContent>
            </Tabs>
        </div>
    );
}
