'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { collection, doc, deleteDoc } from "firebase/firestore";
import { Loader2, PlusCircle, Building, Wrench, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";

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

export function ModulesPage() {
    const firestore = useFirestore();
    const modulesQuery = useMemoFirebase(() => collection(firestore, 'modules'), [firestore]);
    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);

    const { data: modules, loading: modulesLoading } = useCollection<Module>(modulesQuery);
    const { data: vendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);
    const [deleteTarget, setDeleteTarget] = useState<Module | null>(null);
    const [deleting, setDeleting] = useState(false);

    const loading = modulesLoading || vendorsLoading;

    const vendorLogos = useMemo(() => {
        if (!vendors) return new Map<string, string>();
        return new Map(vendors.map(vendor => [vendor.id, vendor.logoUrl || '']));
    }, [vendors]);

    const handleDeleteModule = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteDoc(doc(firestore, 'modules', deleteTarget.id));
            toast({ title: 'Module deleted', description: `${deleteTarget.name} has been removed.` });
            setDeleteTarget(null);
        } catch (error) {
            console.error('Failed to delete module:', error);
            toast({ variant: 'destructive', title: 'Delete failed' });
        } finally {
            setDeleting(false);
        }
    };

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
                                <div key={module.id} className="group relative">
                                    <Link href={`/modules/${module.slug || module.id}`} className="block h-full">
                                        <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:-translate-y-1 group-hover:shadow-xl overflow-hidden flex flex-col rounded-2xl border-2">
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
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-2 right-2 h-7 w-7 rounded-lg bg-white/80 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 z-10"
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(module); }}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            )})}
                        </div>
                    )}
                </>
            )}
        </div>

        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
            <DialogContent className="rounded-3xl border-4 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase tracking-tight">Delete Module</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will remove the module configuration. Data in the data warehouse will not be affected.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                    <DialogClose asChild>
                        <Button variant="outline" className="rounded-xl">Cancel</Button>
                    </DialogClose>
                    <Button variant="destructive" className="rounded-xl font-black uppercase text-[10px]" onClick={handleDeleteModule} disabled={deleting}>
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        Delete Module
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </AdminGuard>
    );
}

export default ModulesPage;