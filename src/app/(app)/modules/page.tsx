
'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { Loader2, PlusCircle, Building, Wrench } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

interface Module {
    id: string;
    name: string;
    slug?: string;
    mainVendorId: string;
    logoUrl?: string;
}

interface Vendor {
    id: string;
    logoUrl?: string;
}

export default function ModulesPage() {
    const { data: modules, loading: modulesLoading } = useCollection<Module>('modules');
    const { data: vendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');

    const loading = modulesLoading || vendorsLoading;

    const vendorLogos = useMemo(() => {
        if (!vendors) return new Map<string, string>();
        return new Map(vendors.map(vendor => [vendor.id, vendor.logoUrl || '']));
    }, [vendors]);

    return (
      <AdminGuard>
        <div className="space-y-4">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Modules</h1>
                    <BreadcrumbNav />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/modules/dealer-fit-options">
                            <Wrench className="mr-2 h-4 w-4" />
                            Dealer Fit Options
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/modules/add">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Module
                        </Link>
                    </Button>
                </div>
            </div>

             {loading ? (
                <div className="flex justify-center items-center py-24">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    {!modules || modules.length === 0 ? (
                         <Card className="flex flex-col items-center justify-center h-80 border-2 border-dashed">
                            <Building className="h-16 w-16 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">No Modules Created</h3>
                            <p className="mt-2 text-sm text-muted-foreground">Get started by creating the first module.</p>
                            <Button asChild className="mt-6">
                                <Link href="/modules/add">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Create First Module
                                </Link>
                            </Button>
                        </Card>
                    ) : (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {modules.map((module) => {
                                const logoUrl = module.logoUrl || vendorLogos.get(module.mainVendorId);
                                return (
                                <Link href={`/modules/${module.slug || module.id}`} key={module.id} className="group">
                                    <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:-translate-y-1 group-hover:shadow-xl overflow-hidden flex flex-col">
                                        <CardHeader className="h-28 bg-secondary flex items-center justify-center p-4">
                                            {logoUrl ? (
                                                <div className="relative h-full w-full">
                                                    <Image src={logoUrl} alt={`${module.name} logo`} fill className="object-contain p-2" />
                                                </div>
                                            ) : (
                                                <Building className="h-10 w-10 text-muted-foreground"/>
                                            )}
                                        </CardHeader>
                                        <CardContent className="p-4 flex-grow flex items-center justify-center">
                                            <CardTitle className="text-lg text-center">{module.name}</CardTitle>
                                        </CardContent>
                                    </Card>
                                </Link>
                            )})}
                        </div>
                    )}
                </>
            )}
        </div>
      </AdminGuard>
    );
}
