'use client';

import { useState } from "react";
import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    Globe,
    User
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
    logoUrl?: string;
    vendorType?: string;
    primaryContact?: string;
    website?: string;
    notes?: string;
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

export default function DataConnectPage() {
    const { data: vendors, loading } = useCollection<Vendor>('vendors');
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [filterType, setFilterType] = useState<string>('all');
    const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);
    const firestore = useFirestore();
    const { toast } = useToast();

    const filteredVendors = vendors?.filter(vendor => filterType === 'all' || vendor.vendorType === filterType);

    const handleDeleteVendor = async () => {
        if (!vendorToDelete) return;
        try {
            const vendorRef = doc(firestore, 'vendors', vendorToDelete.id);
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
            setVendorToDelete(null);
        }
    };

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
                            <h3 className="mt-4 text-lg font-semibold">No Vendor Connections</h3>
                            <p className="mt-2 text-sm text-muted-foreground">You haven't connected to any vendors yet.</p>
                            <Button asChild className="mt-6">
                                <Link href="/data-connect/add">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Connect to First Vendor
                                </Link>
                            </Button>
                        </Card>
                    ) : filteredVendors && filteredVendors.length > 0 ? (
                        <>
                            {viewMode === 'card' ? (
                                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {filteredVendors.map((vendor) => (
                                        <Card key={vendor.id} className="group relative transition-shadow duration-300 hover:shadow-lg">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10">
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

                                            <CardContent className="p-4 flex items-center gap-4">
                                                <div className="h-12 w-12 relative flex-shrink-0">
                                                    {vendor.logoUrl ? (
                                                        <Image src={vendor.logoUrl} alt={`${vendor.name} logo`} fill className="rounded-md object-contain" />
                                                    ) : (
                                                        <div className="h-full w-full flex items-center justify-center rounded-md bg-secondary">
                                                            <Building className="h-6 w-6 text-muted-foreground"/>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex-grow overflow-hidden">
                                                    <p className="font-semibold truncate">{vendor.name}</p>
                                                    {vendor.vendorType && (
                                                        <Badge variant="secondary" className="flex items-center gap-1.5 text-xs mt-1 py-0.5 px-2 w-fit">
                                                            {getVendorTypeIcon(vendor.vendorType)}
                                                            <span>{vendor.vendorType}</span>
                                                        </Badge>
                                                    )}
                                                </div>
                                                
                                                <div className="flex items-center shrink-0 gap-3 text-sm text-muted-foreground">
                                                     {vendor.website && (
                                                        <a href={!vendor.website.startsWith('http') ? `https://${vendor.website}` : vendor.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary" title={vendor.website}>
                                                            <Globe className="h-4 w-4" />
                                                        </a>
                                                    )}
                                                    {vendor.primaryContact && (
                                                        <div className="hover:text-primary cursor-default" title={vendor.primaryContact}>
                                                            <User className="h-4 w-4" />
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <Card>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-2/5">Vendor</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Contact</TableHead>
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
                                                         {vendor.vendorType && (
                                                            <Badge variant="secondary" className="flex items-center gap-1.5 py-1 px-2.5">
                                                                {getVendorTypeIcon(vendor.vendorType)}
                                                                <span className="text-xs">{vendor.vendorType}</span>
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                                                            {vendor.primaryContact && (
                                                                <div className="flex items-center gap-2" title={vendor.primaryContact}>
                                                                    <User className="h-4 w-4 flex-shrink-0" />
                                                                    <span className="truncate">{vendor.primaryContact}</span>
                                                                </div>
                                                            )}
                                                            {vendor.website && (
                                                                <a href={!vendor.website.startsWith('http') ? `https://${vendor.website}` : vendor.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline" title={vendor.website}>
                                                                    <Globe className="h-4 w-4 flex-shrink-0" />
                                                                    <span className="truncate">{vendor.website}</span>
                                                                </a>
                                                            )}
                                                        </div>
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
