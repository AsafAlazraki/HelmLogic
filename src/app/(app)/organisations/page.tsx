'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { Loader2, PlusCircle, Building2 } from "lucide-react";
import Link from "next/link";

interface Organisation {
    id: string;
    name: string;
    address?: string;
    primaryLogoUrl?: string; // Future use
    primaryColor?: string;
    phoneNumber?: string;
}

export default function OrganisationsPage() {
    const { data: organisations, loading } = useCollection<Organisation>('organisations');

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
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {organisations && organisations.length > 0 ? (
                        organisations.map((org) => (
                            <Link href={`/organisations/${org.id}`} key={org.id} className="group">
                                <Card 
                                    className="h-full transition-all duration-300 ease-in-out group-hover:-translate-y-1 group-hover:shadow-xl overflow-hidden flex flex-col"
                                    style={{ borderTop: `4px solid ${org.primaryColor || 'hsl(var(--primary))'}` }}
                                >
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <CardTitle className="text-lg pr-4">{org.name}</CardTitle>
                                            <div 
                                                className="p-2 rounded-lg flex-shrink-0"
                                                style={{ backgroundColor: `${org.primaryColor}1A`}} // primary color with low opacity
                                            >
                                                <Building2 className="h-6 w-6" style={{ color: org.primaryColor || 'hsl(var(--primary))' }} />
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex-grow">
                                        <p className="text-sm text-muted-foreground line-clamp-2">{org.address || 'No address provided'}</p>
                                        {org.phoneNumber && <p className="text-sm text-muted-foreground mt-2">{org.phoneNumber}</p>}
                                    </CardContent>
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
            )}
        </div>
      </AdminGuard>
    );
}
