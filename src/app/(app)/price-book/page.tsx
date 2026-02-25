'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc } from "firebase/firestore";
import { Loader2, BookOpen, ShieldAlert } from "lucide-react";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PriceBookTable } from "@/components/price-book-table";
import { useMemo } from "react";

export default function PriceBookPage() {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();
    
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<any>(userProfileRef);
    
    const organisationId = userProfile?.organisationId;
    const orgRef = useMemoFirebase(() => organisationId ? doc(firestore, 'organisations', organisationId) : null, [firestore, organisationId]);
    const { data: organisation, loading: orgLoading } = useDoc<any>(orgRef);

    const isLoading = userLoading || profileLoading || orgLoading;

    const hasPermission = useMemo(() => {
        if (isLoading) return true;
        if (userProfile?.appRole === 'HelmLogic Admin') return true;
        const roleId = userProfile?.organisationRole;
        if (!roleId || !organisation?.permissions?.[roleId]) return false;
        return !!organisation.permissions[roleId].can_access_price_book;
    }, [userProfile, organisation, isLoading]);

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center min-h-[400px]">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    if (!organisationId || !organisation) {
        return (
            <div className="space-y-4 max-w-full min-w-0 overflow-hidden">
                <div>
                    <h1 className="text-2xl font-semibold">Price Book</h1>
                    <BreadcrumbNav />
                </div>
                <Card className="border-dashed h-80 flex flex-col items-center justify-center text-center">
                    <BookOpen className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                    <CardTitle>No Organisation Context</CardTitle>
                    <CardDescription>You must be a member of an organisation to access the price book.</CardDescription>
                </Card>
            </div>
        );
    }

    if (!hasPermission) {
        return (
            <div className="space-y-4 max-w-full min-w-0 overflow-hidden">
                <div>
                    <h1 className="text-2xl font-semibold">Price Book</h1>
                    <BreadcrumbNav />
                </div>
                <Card className="border-destructive/50">
                    <CardHeader>
                        <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-6 w-6" />
                            <CardTitle>Access Denied</CardTitle>
                        </div>
                        <CardDescription>You do not have permission to access the Price Book.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Please contact your administrator if you believe this is an error.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-full min-w-0 overflow-hidden">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Organisation Price Book</h1>
                    <BreadcrumbNav />
                </div>
            </div>
            <PriceBookTable organisation={organisation} />
        </div>
    );
}