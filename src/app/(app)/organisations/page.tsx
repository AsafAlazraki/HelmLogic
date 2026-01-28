'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function OrganisationsPage() {
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
            <p>Here you can manage your organisations.</p>
        </div>
      </AdminGuard>
    );
}
