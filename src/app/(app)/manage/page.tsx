'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc } from "firebase/firestore";
import { ShieldAlert, Settings2, Database, Anchor, Building2, Grid3X3, Truck, Gauge } from "lucide-react";
import ManageOrganisationPage from "@/components/manage-organisation-page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { useMemo, useState } from "react";
import { HelmLogicLoading } from "@/components/helmlogic-loading";
import { cn } from "@/lib/utils";
import { RiggingKitsManager } from "@/components/rigging-kits-manager";
import { SuppliersManager } from "@/components/suppliers-manager";
import { PricingMatrixManager } from "@/components/pricing-matrix-manager";
import { FreightConfigManager } from "@/components/freight-config-manager";
import { EngineServiceSchedulesManager } from "@/components/engine-service-schedules-manager";

interface UserProfile {
    organisationId?: string;
    organisationRole?: string;
    appRole?: string;
}

interface Organisation {
    id: string;
    permissions?: Record<string, Record<string, boolean>>;
}

type ManageSection = 'organisation' | 'mpf-data';

export default function ManagePage() {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(userProfileRef);

    const orgRef = useMemoFirebase(() => userProfile?.organisationId ? doc(firestore, 'organisations', userProfile.organisationId) : null, [firestore, userProfile]);
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(orgRef);

    const isLoading = userLoading || profileLoading || orgLoading;

    // Top-level section switcher. The Organisation section (all existing
    // tabs) stays mounted but CSS-hidden while MPF Data is active so
    // unsaved org-form edits survive a section switch. MPF Data content
    // lazy-mounts on first activation (controlled-tabs gating — v1.10
    // lesson: admin components only mount on tab activation).
    const [section, setSection] = useState<ManageSection>('organisation');
    const [mpfActivated, setMpfActivated] = useState(false);

    const hasPermission = useMemo(() => {
        if (isLoading) return true; // Show loading instead of denied during loading
        if (userProfile?.appRole === 'HelmLogic Admin') return true;
        const roleId = userProfile?.organisationRole;
        if (!roleId || !organisation?.permissions?.[roleId]) return false;
        return !!organisation.permissions[roleId].can_access_settings;
    }, [userProfile, organisation, isLoading]);

    if (isLoading) {
        return <HelmLogicLoading label="Synchronizing Settings" />;
    }

    if (!hasPermission) {
        return (
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">Manage Organisation</h1>
                    <BreadcrumbNav />
                </div>
                <Card className="border-destructive/50">
                    <CardHeader>
                        <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-6 w-6" />
                            <CardTitle>Access Denied</CardTitle>
                        </div>
                        <CardDescription>You do not have permission to access organisation settings.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Please contact your administrator if you believe this is an error.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const sectionButton = (value: ManageSection, label: string, Icon: typeof Settings2) => (
        <button
            type="button"
            onClick={() => {
                setSection(value);
                if (value === 'mpf-data') setMpfActivated(true);
            }}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                section === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
            )}
        >
            <Icon className="h-3.5 w-3.5" />
            {label}
        </button>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold">Manage Organisation</h1>
                    <BreadcrumbNav />
                </div>
                {userProfile?.organisationId && (
                    <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1">
                        {sectionButton('organisation', 'Organisation', Settings2)}
                        {sectionButton('mpf-data', 'MPF Data', Database)}
                    </div>
                )}
            </div>
            {userProfile?.organisationId ? (
                <>
                    <div className={section === 'organisation' ? undefined : 'hidden'}>
                        <ManageOrganisationPage orgId={userProfile.organisationId} />
                    </div>
                    {mpfActivated && (
                        <div className={section === 'mpf-data' ? undefined : 'hidden'}>
                            <MpfDataSection organisationId={userProfile.organisationId} />
                        </div>
                    )}
                </>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>No Organisation Found</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>You are not currently a member of any organisation.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

/**
 * MPF Data — admin surfaces for the MPF-workbook-backed collections
 * (`riggingKits`, `suppliers`, `pricingMatrix`, `freightConfig`,
 * `engineServiceSchedules` under `organisations/{orgId}/`).
 *
 * Sub-tabs are controlled + lazy-mounted (`{tab === x && <Manager/>}`)
 * so each manager only subscribes to its collection once its tab is
 * activated — same gating pattern as the Fit-Up / Service Catalog tabs.
 */
function MpfDataSection({ organisationId }: { organisationId: string }) {
    const [tab, setTab] = useState('rigging-kits');
    return (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="rigging-kits">
                    <Anchor className="h-3.5 w-3.5 mr-1" /> Rigging Kits
                </TabsTrigger>
                <TabsTrigger value="suppliers">
                    <Building2 className="h-3.5 w-3.5 mr-1" /> Suppliers
                </TabsTrigger>
                <TabsTrigger value="pricing-matrix">
                    <Grid3X3 className="h-3.5 w-3.5 mr-1" /> Pricing Matrix
                </TabsTrigger>
                <TabsTrigger value="freight">
                    <Truck className="h-3.5 w-3.5 mr-1" /> Freight
                </TabsTrigger>
                <TabsTrigger value="service-schedules">
                    <Gauge className="h-3.5 w-3.5 mr-1" /> Engine Servicing
                </TabsTrigger>
            </TabsList>
            <TabsContent value="rigging-kits" className="m-0">
                {tab === 'rigging-kits' && <RiggingKitsManager organisationId={organisationId} />}
            </TabsContent>
            <TabsContent value="suppliers" className="m-0">
                {tab === 'suppliers' && <SuppliersManager organisationId={organisationId} />}
            </TabsContent>
            <TabsContent value="pricing-matrix" className="m-0">
                {tab === 'pricing-matrix' && <PricingMatrixManager organisationId={organisationId} />}
            </TabsContent>
            <TabsContent value="freight" className="m-0">
                {tab === 'freight' && <FreightConfigManager organisationId={organisationId} />}
            </TabsContent>
            <TabsContent value="service-schedules" className="m-0">
                {tab === 'service-schedules' && <EngineServiceSchedulesManager organisationId={organisationId} />}
            </TabsContent>
        </Tabs>
    );
}
