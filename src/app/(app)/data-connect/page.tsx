'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { Loader2, PlusCircle, Building, Mail, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    email?: string;
    phone?: string;
    vendorType?: string;
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
                                <Card key={vendor.id} className="group relative transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl overflow-hidden flex flex-col">
                                    <CardHeader className="flex-grow flex items-center justify-center p-4 relative">
                                        {vendor.logoUrl ? (
                                            <div className="relative h-20 w-full">
                                                <Image
                                                    src={vendor.logoUrl}
                                                    alt={`${vendor.name} logo`}
                                                    fill
                                                    className="object-contain"
                                                />
                                            </div>
                                        ) : (
                                            <CardTitle className="text-xl text-center truncate">{vendor.name}</CardTitle>
                                        )}
                                         {vendor.vendorType && (
                                            <Badge variant="secondary" className="absolute bottom-2 left-2 z-10">{vendor.vendorType}</Badge>
                                        )}
                                    </CardHeader>
                                    <CardContent className="pt-4 border-t">
                                        <div className="space-y-2 text-sm text-muted-foreground">
                                            {vendor.email && (
                                                <div className="flex items-center gap-2">
                                                    <Mail className="h-4 w-4 flex-shrink-0" />
                                                    <a href={`mailto:${vendor.email}`} className="truncate hover:underline">{vendor.email}</a>
                                                </div>
                                            )}
                                            {vendor.phone && (
                                                <div className="flex items-center gap-2">
                                                    <Phone className="h-4 w-4 flex-shrink-0" />
                                                    <a href={`tel:${vendor.phone}`} className="hover:underline">{vendor.phone}</a>
                                                </div>
                                            )}
                                        </div>
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
