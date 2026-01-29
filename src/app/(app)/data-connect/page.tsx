'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Building } from "lucide-react";
import Link from "next/link";

export default function DataConnectPage() {
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

        </div>
      </AdminGuard>
    );
}