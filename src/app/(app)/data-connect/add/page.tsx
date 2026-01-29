'use client';

import { useRouter } from 'next/navigation';
import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AddDataConnectionPage() {
    const router = useRouter();

    return (
        <AdminGuard>
            <div className="space-y-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Connect to a New Vendor</h1>
                        <BreadcrumbNav />
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Vendor Connection</CardTitle>
                        <CardDescription>
                            Select a vendor to connect to and provide the necessary credentials.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p>Vendor connection form will go here.</p>
                    </CardContent>
                </Card>
            </div>
        </AdminGuard>
    );
}