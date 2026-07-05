
'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc, collection, query, where } from "firebase/firestore";
import { Loader2, Users, Building, ShieldAlert, ChevronRight, PlusCircle } from "lucide-react";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo } from "react";

export default function SubDealersPage() {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();
    
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<any>(userProfileRef);
    
    const organisationId = userProfile?.organisationId;
    const orgRef = useMemoFirebase(() => organisationId ? doc(firestore, 'organisations', organisationId) : null, [firestore, organisationId]);
    const { data: organisation, loading: orgLoading } = useDoc<any>(orgRef);

    const subDealersQuery = useMemoFirebase(() => {
        if (!organisationId) return null;
        return query(collection(firestore, 'organisations'), where('parentOrganisationId', '==', organisationId));
    }, [firestore, organisationId]);

    const { data: subDealers, loading: subDealersLoading } = useCollection<any>(subDealersQuery);

    const isLoading = userLoading || profileLoading || orgLoading || subDealersLoading;

    const hasPermission = useMemo(() => {
        if (isLoading) return true;
        if (userProfile?.appRole === 'HelmLogic Admin') return true;
        const roleId = userProfile?.organisationRole;
        if (!roleId || !organisation?.permissions?.[roleId]) return false;
        return !!organisation.permissions[roleId].can_view_subdealers;
    }, [userProfile, organisation, isLoading]);

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center min-h-[400px]">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    if (!hasPermission) {
        return (
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">Sub Dealers</h1>
                    <BreadcrumbNav />
                </div>
                <Card className="border-destructive/50">
                    <CardHeader>
                        <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-6 w-6" />
                            <CardTitle>Access Denied</CardTitle>
                        </div>
                        <CardDescription>You do not have permission to view sub dealers.</CardDescription>
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
                <h1 className="text-2xl font-semibold">Sub Dealer Network</h1>
                <BreadcrumbNav />
            </div>
            
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Your Network</CardTitle>
                        <CardDescription>Manage business relationships and configurations for your sub-dealers.</CardDescription>
                    </div>
                    {organisation?.subDealersEnabled && (
                        <Button asChild>
                            <Link href={`/organisations/${organisationId}/add-sub-dealer`}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add Sub Dealer
                            </Link>
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {subDealers && subDealers.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Sub Dealer Name</TableHead>
                                        <TableHead>Address</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {subDealers.map(sd => (
                                        <TableRow key={sd.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 bg-secondary rounded-full flex items-center justify-center border">
                                                        <Building className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                    {sd.name}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">{sd.address || 'N/A'}</TableCell>
                                            <TableCell className="text-muted-foreground text-sm">{sd.phoneNumber || 'N/A'}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" asChild className="hover:bg-primary hover:text-primary-foreground transition-colors">
                                                    <Link href={`/sub-dealers/${sd.slug || sd.id}`}>
                                                        Manage
                                                        <ChevronRight className="ml-1 h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg bg-muted/5">
                            <Users className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                            <h3 className="text-lg font-semibold">No Sub Dealers Found</h3>
                            <p className="text-sm text-muted-foreground max-w-xs">
                                You haven't added any sub-dealers to your network yet.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
