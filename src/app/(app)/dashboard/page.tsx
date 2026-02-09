'use client';

import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Loader2, Building, Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";

interface UserProfile {
    appRole?: string;
    organisationId?: string;
}

interface Organisation {
    id: string;
    name: string;
    dataWarehouseSubscriptions?: string[];
}

interface Vendor {
    id:string;
    name: string;
    slug?: string;
    logoUrl?: string;
}

function EmployeeDashboard({ organisationId }: { organisationId: string }) {
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(organisationId ? `/organisations/${organisationId}` : null);

    const subscribedVendorIds = useMemo(() => organisation?.dataWarehouseSubscriptions || [], [organisation]);

    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');

    const subscribedVendors = useMemo(() => {
        if (!allVendors || subscribedVendorIds.length === 0) return [];
        return allVendors.filter(vendor => subscribedVendorIds.includes(vendor.id));
    }, [allVendors, subscribedVendorIds]);

    const loading = orgLoading || vendorsLoading;

    if (loading) {
        return (
            <div className="flex h-[400px] w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Data Vendors</CardTitle>
                        <CardDescription>Your subscribed data sources.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {subscribedVendors.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {subscribedVendors.map(vendor => (
                                    <Link href={`/vendor-data/${vendor.slug || vendor.id}`} key={vendor.id} className="group">
                                        <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:-translate-y-1 group-hover:shadow-md overflow-hidden">
                                            <div className="h-24 bg-secondary flex items-center justify-center p-4">
                                                {vendor.logoUrl ? (
                                                    <div className="relative h-full w-full">
                                                        <Image src={vendor.logoUrl} alt={`${vendor.name} logo`} fill className="object-contain" />
                                                    </div>
                                                ) : (
                                                    <Building className="h-10 w-10 text-muted-foreground"/>
                                                )}
                                            </div>
                                            <div className="p-3 text-center">
                                                <p className="text-sm font-medium truncate">{vendor.name}</p>
                                            </div>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-lg">
                                <Building className="h-12 w-12 text-muted-foreground" />
                                <p className="mt-4 text-sm text-muted-foreground">No data vendors subscribed.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
                 <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                        <CardDescription>Track recent events and updates.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search activity..." className="pl-8" />
                        </div>
                         <div className="flex items-center justify-center h-40 mt-4 text-muted-foreground border-2 border-dashed rounded-lg">
                            <p>Activity feed coming soon.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Performance Overview</CardTitle>
                </CardHeader>
                 <CardContent className="flex items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>Performance charts coming soon.</p>
                </CardContent>
            </Card>
        </div>
    )
}


export default function Dashboard() {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(user ? `/users/${user.uid}` : null);
    const router = useRouter();

    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';
    const organisationId = userProfile?.organisationId;
    const isLoading = userLoading || profileLoading;

    useEffect(() => {
        if (!isLoading && isAdmin) {
            router.replace('/admin');
        }
    }, [isLoading, isAdmin, router]);

    if (isLoading || isAdmin) {
        return (
            <div className="flex h-[400px] w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Dashboard</h1>
                <BreadcrumbNav />
            </div>
            {organisationId ? <EmployeeDashboard organisationId={organisationId} /> : <p>You are not part of an organisation.</p>}
        </div>
    );
}
