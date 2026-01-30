'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { 
    Loader2, 
    PlusCircle, 
    Building, 
    Sailboat,
    Cog,
    Truck,
    CircuitBoard,
    Plug,
    Boxes,
    MoreHorizontal,
    LayoutGrid,
    List,
    Trash2,
    Pencil,
    Briefcase,
    Cable,
    UploadCloud,
    Globe,
    FileText,
    Paperclip
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFirestore } from "@/firebase/provider";
import { doc, deleteDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface Vendor {
    id: string;
    name: string;
    slug?: string;
    logoUrl?: string;
    vendorType?: string;
    dataSource?: string;
    primaryContact?: string;
    website?: string;
    notes?: string;
    attachmentUrl?: string;
    attachmentName?: string;
}

const vendorTypes = [
    'Boat Brand',
    'Motor Brand',
    'Trailer Brand',
    'Electronics Brand',
    'Electronics Supplier',
    'Parts Wholesaler',
    'Other'
];

const getVendorTypeIcon = (vendorType?: string) => {
    const iconProps = { className: "h-3 w-3" };
    switch (vendorType) {
        case 'Boat Brand':
            return <Sailboat {...iconProps} />;
        case 'Motor Brand':
            return <Cog {...iconProps} />;
        case 'Trailer Brand':
            return <Truck {...iconProps} />;
        case 'Electronics Brand':
            return <CircuitBoard {...iconProps} />;
        case 'Electronics Supplier':
            return <Plug {...iconProps} />;
        case 'Parts Wholesaler':
            return <Boxes {...iconProps} />;
        case 'Other':
            return <MoreHorizontal {...iconProps} />;
        default:
            return null;
    }
};

const getDataSourceIcon = (dataSource?: string) => {
    const iconProps = { className: "h-3 w-3" };
    switch (dataSource) {
        case 'Business Central':
            return <Briefcase {...iconProps} />;
        case 'Direct API':
            return <Cable {...iconProps} />;
        case 'Document Upload':
            return <UploadCloud {...iconProps} />;
        case 'Other':
            return <MoreHorizontal {...iconProps} />;
        default:
            return null;
    }
};

export default function DataWarehousePage() {
    const { data: vendors, loading } = useCollection<Vendor>('data-warehouse');
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [filterType, setFilterType] = useState<string>('all');
    const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);
    const firestore = useFirestore();
    const { toast } = useToast();
    const router = useRouter();

    const filteredVendors = vendors?.filter(vendor => filterType === 'all' || vendor.vendorType === filterType);

    const handleDeleteVendor = async () => {
        if (!vendorToDelete) return;
        try {
            const vendorRef = doc(firestore, 'data-warehouse', vendorToDelete.id);
            await deleteDoc(vendorRef);
            toast({
                title: 'Vendor Deleted',
                description: `${vendorToDelete.name} has been successfully deleted.`,
            });
            window.location.reload();
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Deletion Failed',
                description: `Could not delete ${vendorToDelete.name}.`,
            });
            console.error("Failed to delete vendor:", error);
        } finally {
            setVendorToDelete(null);
        }
    };

    return (
      <AdminGuard>
        <div className="space-y-4">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Data Warehouse</h1>
                    <BreadcrumbNav />
                </div>
                <Button asChild>
                    <Link href="/data-warehouse/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Vendor
                    </Link>
                </Button>
            </div>
            
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-[240px]">
                            <SelectValue placeholder="Filter by vendor type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Vendor Types</SelectItem>
                            {vendorTypes.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant={viewMode === 'card' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('card')}>
                        <LayoutGrid className="h-4 w-4" />
                        <span className="sr-only">Card View</span>
                    </Button>
                    <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
                        <List className="h-4 w-4" />
                        <span className="sr-only">List View</span>
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-24">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    {!vendors || vendors.length === 0 ? (
                        <Card className="flex flex-col items-center justify-center h-80 border-2 border-dashed">
                            <Building className="h-16 w-16 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">No Vendors in Warehouse</h3>
                            <p className="mt-2 text-sm text-muted-foreground">You haven't added any vendors to the warehouse yet.</p>
                            <Button asChild className="mt-6">
                                <Link href="/data-warehouse/add">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Add First Vendor
                                </Link>
                            </Button>
                        </Card>
                    ) : filteredVendors && filteredVendors.length > 0 ? (
                        <>
                            {viewMode === 'card' ? (
                                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {filteredVendors.map((vendor) => {
                                        const hasTwoBadges = !!(vendor.vendorType && vendor.dataSource);
                                        return (
                                        <Link href={`/data-warehouse/${vendor.slug || vendor.id}`} key={vendor.id} className="group">
                                            <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:-translate-y-1 group-hover:shadow-xl overflow-hidden flex flex-col">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 hover:bg-background" onClick={(e) => e.preventDefault()}>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem 
                                                            className="text-destructive"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                setVendorToDelete(vendor);
                                                            }}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                
                                                <div className="h-24 bg-secondary flex items-center justify-center p-4">
                                                    {vendor.logoUrl ? (
                                                        <div className="relative h-full w-full">
                                                            <Image src={vendor.logoUrl} alt={`${vendor.name} logo`} fill className="object-contain" />
                                                        </div>
                                                    ) : (
                                                        <Building className="h-10 w-10 text-muted-foreground"/>
                                                    )}
                                                </div>

                                                <CardContent className="p-4 flex-grow flex flex-col">
                                                    {!vendor.logoUrl && <h3 className="font-semibold truncate text-lg">{vendor.name}</h3>}
                                                    <div className={`grid ${hasTwoBadges ? 'grid-cols-2' : 'grid-cols-1 justify-items-center'} gap-2 ${vendor.logoUrl ? 'mt-0' : 'mt-2'}`}>
                                                        {vendor.vendorType && (
                                                            <Badge variant="secondary" className="flex justify-center items-center gap-1.5 text-xs py-1 px-2">
                                                                {getVendorTypeIcon(vendor.vendorType)}
                                                                <span>{vendor.vendorType}</span>
                                                            </Badge>
                                                        )}
                                                        {vendor.dataSource && (
                                                            <Badge variant="outline" className="flex justify-center items-center gap-1.5 text-xs py-1 px-2">
                                                                {getDataSourceIcon(vendor.dataSource)}
                                                                <span>{vendor.dataSource}</span>
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </CardContent>
                                                <CardFooter className="p-4 pt-0 text-muted-foreground mt-auto flex justify-end gap-3">
                                                    {vendor.website && <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary"><Globe className="h-4 w-4" /></a>}
                                                    {vendor.primaryContact && <FileText className="h-4 w-4" />}
                                                    {vendor.attachmentName && <a href={vendor.attachmentUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary"><Paperclip className="h-4 w-4" /></a>}
                                                </CardFooter>
                                            </Card>
                                        </Link>
                                    )})}
                                </div>
                            ) : (
                                <Card>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-2/5">Vendor</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Contact & Links</TableHead>
                                                <TableHead className="text-right w-[100px]">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredVendors.map((vendor) => (
                                                <TableRow key={vendor.id}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-10 w-10 relative flex-shrink-0">
                                                                {vendor.logoUrl ? (
                                                                    <Image src={vendor.logoUrl} alt={`${vendor.name} logo`} fill className="rounded-md object-contain" />
                                                                ) : (
                                                                    <div className="h-full w-full flex items-center justify-center rounded-md bg-secondary">
                                                                        <Building className="h-5 w-5 text-muted-foreground"/>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="font-medium truncate">{vendor.name}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-2">
                                                            {vendor.vendorType && (
                                                                <Badge variant="secondary" className="flex items-center gap-1.5 py-1 px-2.5 w-fit">
                                                                    {getVendorTypeIcon(vendor.vendorType)}
                                                                    <span className="text-xs">{vendor.vendorType}</span>
                                                                </Badge>
                                                            )}
                                                            {vendor.dataSource && (
                                                                <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 w-fit">
                                                                    {getDataSourceIcon(vendor.dataSource)}
                                                                    <span className="text-xs">{vendor.dataSource}</span>
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        ...
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                    <span className="sr-only">Open menu</span>
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => router.push(`/data-warehouse/${vendor.slug || vendor.id}`)}>
                                                                    <Pencil className="mr-2 h-4 w-4" />
                                                                    Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    className="text-destructive"
                                                                    onClick={() => setVendorToDelete(vendor)}
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </Card>
                            )}
                        </>
                    ) : (
                       <Card className="flex flex-col items-center justify-center h-80 border-2 border-dashed">
                            <Building className="h-16 w-16 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">No Matching Vendors</h3>
                            <p className="mt-2 text-sm text-muted-foreground">No vendors found for the selected filter.</p>
                            <Button variant="outline" className="mt-6" onClick={() => setFilterType('all')}>
                                Clear Filter
                            </Button>
                        </Card>
                    )}
                </>
            )}
        </div>
        <AlertDialog open={!!vendorToDelete} onOpenChange={(open) => !open && setVendorToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete the vendor <strong>{vendorToDelete?.name}</strong>. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setVendorToDelete(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteVendor} className="bg-destructive hover:bg-destructive/90">
                        Yes, delete it
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </AdminGuard>
    );
}
