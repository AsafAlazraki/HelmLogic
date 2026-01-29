'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { Loader2, PlusCircle, Building } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    email?: string;
    phone?: string;
}

export default function DataConnectPage() {
    const { data: vendors, loading } = useCollection<Vendor>('vendors');

    return (
      <AdminGuard>
        <div className="space-y-4">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Data Connect</h1>
                    <BreadcrumbNav />
                </div>
                <Button asChild>
                    <Link href="/data-connect/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Connect to Vendor
                    </Link>
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-24">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    {vendors && vendors.length > 0 ? (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {vendors.map((vendor) => (
                                <Card key={vendor.id} className="group transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl overflow-hidden flex flex-col">
                                    <CardHeader>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-grow overflow-hidden">
                                                {vendor.logoUrl ? (
                                                    <div className="relative h-12">
                                                        <Image
                                                            src={vendor.logoUrl}
                                                            alt={`${vendor.name} logo`}
                                                            fill
                                                            className="object-contain object-left"
                                                        />
                                                    </div>
                                                ) : (
                                                    <CardTitle className="text-lg truncate">{vendor.name}</CardTitle>
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex-grow pt-0">
                                        {vendor.logoUrl && (
                                            <h3 className="font-semibold text-lg truncate">{vendor.name}</h3>
                                        )}
                                        <p className="text-sm text-muted-foreground mt-2">{vendor.email || 'No email provided'}</p>
                                        <p className="text-sm text-muted-foreground">{vendor.phone || 'No phone provided'}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <Card className="flex flex-col items-center justify-center h-80 border-2 border-dashed">
                            <Building className="h-16 w-16 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">No Vendor Connections</h3>
                            <p className="mt-2 text-sm text-muted-foreground">You haven't connected to any vendors yet.</p>
                            <Button asChild className="mt-6">
                                <Link href="/data-connect/add">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Connect to First Vendor
                                </Link>
                            </Button>
                        </Card>
                    )}
                </>
            )}
        </div>
      </AdminGuard>
    );
}
