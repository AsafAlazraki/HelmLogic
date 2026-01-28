'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { Loader2, PlusCircle } from "lucide-react";
import Link from "next/link";

interface Organisation {
    id: string;
    name: string;
    address?: string;
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
                <>
                    {organisations && organisations.length > 0 ? (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {organisations.map((org) => (
                                <Card key={org.id} className="h-full">
                                    <CardHeader>
                                        <CardTitle>{org.name}</CardTitle>
                                    </CardHeader>
                                    {org.address && (
                                        <CardContent>
                                            <p className="text-sm text-muted-foreground line-clamp-2">{org.address}</p>
                                        </CardContent>
                                    )}
                                </Card>
                            ))}
                        </div>
                    ) : (
                         <Card className="flex items-center justify-center h-64 border-dashed">
                             <div className="text-center text-muted-foreground">
                                <h3 className="text-lg font-semibold text-foreground">No Organisations Found</h3>
                                <p className="mt-2">Get started by creating a new organisation.</p>
                             </div>
                        </Card>
                    )}
                </>
            )}
        </div>
      </AdminGuard>
    );
}
