'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { collection } from "firebase/firestore";
import { Loader2, PlusCircle, Building2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface Organisation {
    id: string;
    name: string;
    slug?: string;
    address?: string;
    primaryLogoUrl?: string;
    primaryColor?: string;
    phoneNumber?: string;
    abn?: string;
}

export default function OrganisationsPage() {
    const firestore = useFirestore();
    const orgsQuery = useMemoFirebase(() => collection(firestore, 'organisations'), [firestore]);
    const { data: organisations, loading } = useCollection<Organisation>(orgsQuery);

    return (
      <AdminGuard>
        <div className="space-y-4">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Organisations</h1>
                    <BreadcrumbNav />
                </div>
                <Button asChild>
                    <Link href="/organisations/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        New Organisation
                    </Link>
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-24">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {organisations && organisations.length > 0 ? (
                            organisations.map((org) => (
                                <Link href={`/organisations/${org.slug || org.id}`} key={org.id} className="group">
                                    <Card 
                                        className="h-full transition-all duration-300 ease-in-out group-hover:-translate-y-1 group-hover:shadow-xl group-hover:border-primary overflow-hidden flex flex-col"
                                    >
                                        <div className="h-24 bg-secondary flex items-center justify-center p-4">
                                            {org.primaryLogoUrl ? (
                                                <div className="relative h-full w-full">
                                                    <Image
                                                        src={org.primaryLogoUrl}
                                                        alt={`${org.name} logo`}
                                                        fill
                                                        className="object-contain p-2"
                                                    />
                                                </div>
                                            ) : (
                                                <Building2 className="h-10 w-10 text-muted-foreground" />
                                            )}
                                        </div>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-lg truncate">{org.name}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="flex-grow pt-0 text-sm text-muted-foreground">
                                             <p className="line-clamp-2">{org.address || 'No address provided'}</p>
                                        </CardContent>
                                        <CardFooter className="pt-0 mt-auto flex-col items-start text-xs text-muted-foreground">
                                             {org.phoneNumber && <p>{org.phoneNumber}</p>}
                                             {org.abn && <p>ABN: {org.abn}</p>}
                                        </CardFooter>
                                    </Card>
                                </Link>
                            ))
                        ) : (
                            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
                                <Card className="flex flex-col items-center justify-center h-80 border-2 border-dashed">
                                    <Building2 className="h-16 w-16 text-muted-foreground" />
                                    <h3 className="mt-4 text-lg font-semibold">No Organisations Found</h3>
                                    <p className="mt-2 text-sm text-muted-foreground">You haven't created any organisations yet.</p>
                                    <Button asChild className="mt-6">
                                        <Link href="/organisations/add">
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            Create First Organisation
                                        </Link>
                                    </Button>
                                </Card>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
      </AdminGuard>
    );
}