'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { Loader2 } from "lucide-react";
import ManageOrganisationPage from "@/components/manage-organisation-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";

interface UserProfile {
    organisationId?: string;
}

export default function ManagePage() {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(user ? `/users/${user.uid}` : null);
    
    const isLoading = userLoading || profileLoading;

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Manage Organisation</h1>
                <BreadcrumbNav />
            </div>
            {isLoading ? (
                <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
            ) : userProfile?.organisationId ? (
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
