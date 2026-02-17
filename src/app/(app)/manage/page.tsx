'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { Loader2, ShieldAlert } from "lucide-react";
import ManageOrganisationPage from "@/components/manage-organisation-page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { useMemo } from "react";

interface UserProfile {
    organisationId?: string;
    organisationRole?: string;
    appRole?: string;
}

interface Organisation {
    id: string;
    permissions?: Record<string, Record<string, boolean>>;
}

export default function ManagePage() {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(user ? `/users/${user.uid}` : null);
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(userProfile?.organisationId ? `/organisations/${userProfile.organisationId}` : null);
    
    const isLoading = userLoading || profileLoading || orgLoading;

    const hasPermission = useMemo(() => {
        if (isLoading) return true; // Show loading instead of denied during loading
        if (userProfile?.appRole === 'HelmLogic Admin') return true;
        const roleId = userProfile?.organisationRole;
        if (!roleId || !organisation?.permissions?.[roleId]) return false;
        return !!organisation.permissions[roleId].can_access_settings;
    }, [userProfile, organisation, isLoading]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">Manage Organisation</h1>
                    <BreadcrumbNav />
                </div>
                <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
            </div>
        );
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

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Manage Organisation</h1>
                <BreadcrumbNav />
            </div>
            {userProfile?.organisationId ? (
                <ManageOrganisationPage orgId={userProfile.organisationId} />
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
