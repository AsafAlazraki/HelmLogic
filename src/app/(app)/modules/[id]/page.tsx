'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase/provider';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Loader2, ChevronRight, Wrench, FileText, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase/auth/use-user';
import { ModelConfigurationEditor } from '@/components/model-configuration-editor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ManageOrganisationPage from "@/components/manage-organisation-page";
import { ScrollArea } from '@/components/ui/scroll-area';

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    vendorType: string;
    slug?: string;
}

interface Organisation {
    id: string;
    name: string;
    enabledModuleSubscriptions?: string[];
}

interface Range {
    id: string;
    name: string;
    slug?: string;
    vendorId: string;
    imageUrl?: string;
    order?: number;
}

interface Model {
  id: string;
  name: string;
  slug?: string;
  coverImageUrl?: string;
  order?: number;
  packageLevels?: { id: string; name: string }[];
  [key: string]: any;
}


function RangesGrid({ vendor, onRangeSelect }: { vendor: Vendor; onRangeSelect: (range: Range) => void }) {
    const firestore = useFirestore();
    const rangesQuery = useMemo(() => {
        if (!vendor?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order'));
    }, [firestore, vendor.id]);

    const { data: ranges, loading: rangesLoading } = useCollection<Range>(rangesQuery);

    if (rangesLoading) {
        return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!ranges || ranges.length === 0) {
        return <p className="text-muted-foreground text-center py-8">No product ranges found for {vendor.name}.</p>;
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {ranges.map(range => (
                <div key={range.id} className="group cursor-pointer" onClick={() => onRangeSelect(range)}>
                    <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:shadow-xl hover:-translate-y-1">
                        <div className="h-40 bg-secondary relative">
                            {range.imageUrl ? (
                                <Image src={range.imageUrl} alt={`${range.name} cover`} fill className="object-cover p-4" sizes="(max-width: 768px) 50vw, 25vw" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Loader2 className="h-12 w-12 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <CardHeader>
                            <CardTitle className="text-lg">{range.name}</CardTitle>
                        </CardHeader>
                    </Card>
                </div>
            ))}
        </div>
    );
}

function ModelsGrid({ range, vendor, onModelSelect }: { range: Range; vendor: Vendor; onModelSelect: (model: Model) => void }) {
    const firestore = useFirestore();
    const modelsQuery = useMemo(() => {
        if (!vendor?.id || !range?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), orderBy('order'));
    }, [firestore, vendor.id, range.id]);
    
    const { data: models, loading: modelsLoading } = useCollection<Model>(modelsQuery);
    
    if (modelsLoading) {
        return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!models || models.length === 0) {
        return <p className="text-muted-foreground text-center py-8">No models found for {range.name}.</p>;
    }
    
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {models.map(model => (
                 <Card key={model.id} className="group overflow-hidden flex flex-col h-full transition-all duration-300 ease-in-out hover:border-primary hover:shadow-xl hover:-translate-y-1 cursor-pointer" onClick={() => onModelSelect(model)}>
                    <div className="flex-grow">
                        <div className="h-52 bg-secondary relative">
                                {model.coverImageUrl ? (
                                <Image src={model.coverImageUrl} alt={`${model.name} cover`} fill className="object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Loader2 className="h-12 w-12 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <CardContent className="p-3 h-20 flex items-center justify-center">
                            <p className="font-semibold text-center line-clamp-2">{model.name}</p>
                        </CardContent>
                    </div>

                    {vendor.slug === 'stabicraft' && (
                        <div className="p-3 border-t">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-sm font-medium text-muted-foreground">Packages</h4>
                                </div>
                                <div className="space-y-1 min-h-[108px] flex flex-col">
                                    {(model.packageLevels && model.packageLevels.length > 0) ? (
                                        <div className="flex-grow space-y-1">
                                        {model.packageLevels.map(pkg => (
                                            <div key={pkg.id} className="group/pkg flex items-center justify-between rounded-md bg-secondary text-secondary-foreground px-3 py-1.5 text-sm transition-colors hover:bg-secondary/80 w-full h-full">
                                                <span className="font-medium truncate pr-2">{pkg.name}</span>
                                            </div>
                                        ))}
                                        </div>
                                    ) : (
                                        <div className="flex-grow flex items-center justify-center text-xs text-muted-foreground">
                                            <p>No packages defined.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            ))}
        </div>
    );
}

function ModuleConfigurationBreadcrumbs({ module, range, model, view, onBreadcrumbClick }: { module: any; range: Range | null; model: Model | null; view: 'ranges' | 'models' | 'bmt' | 'quote' | 'operations', onBreadcrumbClick: (level: 'ranges' | 'models') => void }) {
    return (
        <div className="flex items-center text-sm text-muted-foreground">
            <button type="button" className="hover:text-primary" onClick={() => onBreadcrumbClick('ranges')}>{module.name}</button>
            {range && (view === 'models' || view === 'bmt' || view === 'quote' || view === 'operations') && (
                <>
                    <ChevronRight className="h-4 w-4 mx-1" />
                    <button type="button" className="hover:text-primary" onClick={() => onBreadcrumbClick('models')}>{range.name}</button>
                </>
            )}
            {model && (view === 'bmt' || view === 'quote' || view === 'operations') && (
                <>
                    <ChevronRight className="h-4 w-4 mx-1" />
                    <span className="font-medium text-foreground">{model.name}</span>
                </>
            )}
        </div>
    );
}


export default function ModuleDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const slugOrId = params.id as string;
    
    // State for configuration flow
    const [view, setView] = useState<'ranges' | 'models' | 'bmt' | 'quote' | 'operations'>('ranges');
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [selectedModel, setSelectedModel] = useState<Model | null>(null);
    const [isChoiceDialogOpen, setIsChoiceDialogOpen] = useState(false);

    const firestore = useFirestore();

    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole?: string, organisationId?: string }>(user ? `/users/${user.uid}` : null);
    
    const moduleQueryBySlug = useMemo(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'modules'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);

    const { data: modulesBySlug, loading: slugLoading } = useCollection<any>(moduleQueryBySlug);
    const { data: moduleById, loading: idLoading } = useDoc<any>(slugOrId ? `/modules/${slugOrId}` : null);
    
    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);
    const moduleLoading = slugLoading || idLoading;
    
    const { data: mainVendor, loading: mainVendorLoading } = useDoc<Vendor>(moduleData ? `/data-warehouse/${moduleData.mainVendorId}` : null);
        
    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';
    const isBoatBrand = mainVendor?.vendorType === 'Boat Brand';
    
    // NEW handlers for the configuration flow
    const handleRangeSelect = (range: Range) => {
        setSelectedRange(range);
        setView('models');
    };
    
    const handleModelSelect = (model: Model) => {
        setSelectedModel(model);
        setIsChoiceDialogOpen(true);
    };

    const handleChoiceSelect = (choice: 'bmt' | 'quote' | 'operations') => {
        setView(choice);
        setIsChoiceDialogOpen(false);
    };
    
    const handleBreadcrumbClick = (level: 'ranges' | 'models') => {
        if (level === 'ranges') {
            setView('ranges');
            setSelectedRange(null);
            setSelectedModel(null);
        } else if (level === 'models') {
            setView('models');
            setSelectedModel(null);
        }
    };
    
    const loading = moduleLoading || mainVendorLoading || userLoading || profileLoading;
    const defaultTab = isAdmin ? 'bmt' : 'dashboard';

    if (loading) {
      return <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
    }
    
    if (!moduleData) {
        return <Card><CardHeader><CardTitle>Module Not Found</CardTitle></CardHeader><CardContent><p>The requested module could not be found.</p></CardContent></Card>;
    }
    
    const breadcrumbParts = [
        isAdmin ? { href: "/admin", label: "Admin" } : { href: "/dashboard", label: "Dashboard"},
        isAdmin ? { href: "/modules", label: "Modules" } : {href: "/dashboard", label: "Dashboard"},
        { href: `/modules/${slugOrId}`, label: moduleData.name },
    ];
    
    return (
        <div className="space-y-4">
             <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Module: {moduleData.name}</h1>
                    <BreadcrumbNav parts={breadcrumbParts.filter(p => isAdmin || p.label !== 'Modules')} />
                </div>
            </div>
             <Tabs defaultValue={defaultTab}>
                 {isAdmin ? (
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="bmt">BMT</TabsTrigger>
                        <TabsTrigger value="operations">Operations</TabsTrigger>
                        <TabsTrigger value="organisations">Organisations</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </TabsList>
                ) : (
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                        <TabsTrigger value="bmt">BMT</TabsTrigger>
                        <TabsTrigger value="operations">Operations</TabsTrigger>
                    </TabsList>
                )}
                
                {!isAdmin && (
                    <TabsContent value="dashboard">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-1 flex flex-col gap-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>In Stock</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground">Stock information will be displayed here.</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader>
                                        <CardTitle>On Order</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground">Ordered items will be displayed here.</p>
                                    </CardContent>
                                </Card>
                            </div>
                            <div className="lg:col-span-2">
                                <Card className="h-full flex flex-col">
                                    <CardHeader>
                                        <CardTitle>Quotes</CardTitle>
                                        <CardDescription>A list of recently created quotes.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex-grow">
                                        <ScrollArea className="h-[500px]">
                                            <div className="flex items-center justify-center h-full p-8 text-muted-foreground">
                                                <p>Quotes list will appear here.</p>
                                            </div>
                                        </ScrollArea>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>
                )}

                <TabsContent value="bmt">
                   {view === 'ranges' || view === 'models' ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    {view === 'ranges' ? 'Select a Product Range' : `Models in ${selectedRange?.name}`}
                                </CardTitle>
                                <ModuleConfigurationBreadcrumbs module={moduleData} range={selectedRange} model={selectedModel} view={view} onBreadcrumbClick={handleBreadcrumbClick} />
                            </CardHeader>
                            <CardContent>
                                {isBoatBrand && mainVendor ? (
                                    <>
                                        {view === 'ranges' && <RangesGrid vendor={mainVendor} onRangeSelect={handleRangeSelect} />}
                                        {view === 'models' && selectedRange && <ModelsGrid range={selectedRange} vendor={mainVendor} onModelSelect={handleModelSelect} />}
                                    </>
                                ) : (
                                    <p className="text-muted-foreground">This module's main vendor is not a boat brand. No configuration view available.</p>
                                )}
                            </CardContent>
                        </Card>
                   ) : (
                        <>
                            {view === 'bmt' && selectedModel && selectedRange && mainVendor && (
                                <ModelConfigurationEditor 
                                    model={selectedModel} 
                                    docPath={`/data-warehouse/${mainVendor.id}/ranges/${selectedRange.id}/models/${selectedModel.id}`} 
                                    vendor={mainVendor} 
                                    module={moduleData} 
                                    breadcrumbs={
                                        <ModuleConfigurationBreadcrumbs
                                            module={moduleData}
                                            range={selectedRange}
                                            model={selectedModel}
                                            view={view}
                                            onBreadcrumbClick={handleBreadcrumbClick}
                                        />
                                    }
                                    user={user}
                                    isAdmin={isAdmin}
                                    organisationId={userProfile?.organisationId}
                                />
                            )}
                            {(view === 'quote' || view === 'operations') && (
                                <div className="flex h-96 w-full items-center justify-center rounded-lg border-2 border-dashed">
                                    <div className="text-center">
                                        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                                        <p className="mt-4 text-muted-foreground capitalize">Preparing {view} engine...</p>
                                    </div>
                                </div>
                            )}
                        </>
                   )}
                </TabsContent>

                <TabsContent value="operations">
                    <Card>
                         <CardHeader><CardTitle>Operations</CardTitle><CardDescription>Placeholder for operations functionality.</CardDescription></CardHeader>
                        <CardContent><p className="text-muted-foreground">This section will contain operations-related features for the {moduleData.name} module.</p></CardContent>
                    </Card>
                </TabsContent>

                 {isAdmin && (
                    <TabsContent value="organisations">
                       <ManageOrganisationPage orgId={moduleData.mainVendorId} />
                    </TabsContent>
                )}

                {isAdmin && (
                    <TabsContent value="settings" className="space-y-4">
                       <ManageOrganisationPage orgId={moduleData.mainVendorId} />
                    </TabsContent>
                )}
            </Tabs>
             <Dialog open={isChoiceDialogOpen} onOpenChange={setIsChoiceDialogOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-center text-2xl font-semibold text-card-foreground">{selectedModel?.name}</DialogTitle>
                        <DialogDescription className="text-center text-lg text-muted-foreground">What would you like to do with this model?</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
                        <Card className="group cursor-pointer bg-card text-card-foreground hover:border-primary hover:bg-primary/5 transition-all duration-300 transform hover:-translate-y-1" onClick={() => handleChoiceSelect('bmt')}>
                            <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                                <Wrench className="h-12 w-12 text-primary transition-transform group-hover:scale-110" />
                                <p className="font-semibold text-xl">Configuration</p>
                            </CardContent>
                        </Card>
                        <Card className="group cursor-pointer bg-card text-card-foreground hover:border-primary hover:bg-primary/5 transition-all duration-300 transform hover:-translate-y-1" onClick={() => handleChoiceSelect('quote')}>
                            <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                                <FileText className="h-12 w-12 text-primary transition-transform group-hover:scale-110" />
                                <p className="font-semibold text-xl">Quotation</p>
                            </CardContent>
                        </Card>
                         <Card className="group cursor-pointer bg-card text-card-foreground hover:border-primary hover:bg-primary/5 transition-all duration-300 transform hover:-translate-y-1" onClick={() => handleChoiceSelect('operations')}>
                            <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                                <ClipboardList className="h-12 w-12 text-primary transition-transform group-hover:scale-110" />
                                <p className="font-semibold text-xl">Operations</p>
                            </CardContent>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
    
