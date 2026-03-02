'use client';

import { useMemo, useState } from 'react';
import { useCollection, useDoc, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, PlusCircle, Settings2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from './ui/button';
import { MasterDataBrowserDialog } from './master-data-browser-dialog';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

interface DealerFitCategory {
  id: string;
  name: string;
}

interface Organisation {
  id: string;
  dealerFitCategories?: string[];
  dataWarehouseSubscriptions?: string[];
  moduleAssociatedVendorAccess?: Record<string, string[]>;
}

interface DealerFitSelection {
  id: string;
  name: string;
  type: 'item' | 'package';
  categoryId: string;
  items: {
    vendorId: string;
    rowId: string;
    data: any;
  }[];
}

export function DealerFitOptions({ 
    module, 
    organisationId, 
    isAdmin 
}: { 
    module: any; 
    organisationId?: string; 
    isAdmin?: boolean 
}) {
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const orgRef = useMemoFirebase(() => 
    organisationId ? doc(firestore, 'organisations', organisationId) : null, 
  [firestore, organisationId]);
  const { data: organisation, loading: orgLoading } = useDoc<Organisation>(orgRef);
  
  const categoriesQuery = useMemoFirebase(() => collection(firestore, 'dealerFitCategories'), [firestore]);
  const { data: allCategories, loading: categoriesLoading } = useCollection<DealerFitCategory>(categoriesQuery);
  
  const selectionsQuery = useMemoFirebase(() => {
    if (!organisationId) return null;
    return collection(firestore, `organisations/${organisationId}/dealerFitSelections`);
  }, [firestore, organisationId]);
  const { data: selections, loading: selectionsLoading } = useCollection<DealerFitSelection>(selectionsQuery);

  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const assignedCategories = useMemo(() => {
    if (!allCategories) return [];
    if (isAdmin) return allCategories;
    if (!organisation?.dealerFitCategories) return [];
    return allCategories.filter(cat => organisation.dealerFitCategories?.includes(cat.id));
  }, [allCategories, organisation, isAdmin]);

  const allowedVendorIds = useMemo(() => {
    if (!module) return [];
    
    // Admins always see all associated vendors defined in the module
    if (isAdmin) {
        return (module.associatedVendorIds || []).filter((id: string) => id !== module.mainVendorId);
    }

    // For regular users, we filter by what the organisation has access to
    const orgModuleAccess = organisation?.moduleAssociatedVendorAccess?.[module.id] || [];
    return (module.associatedVendorIds || []).filter((id: string) => 
        id !== module.mainVendorId && orgModuleAccess.includes(id)
    );
  }, [module, organisation, isAdmin]);

  const selectionsByCategory = useMemo(() => {
    if (!selections) return new Map();
    return selections.reduce((acc, selection) => {
      if (!acc.has(selection.categoryId)) {
        acc.set(selection.categoryId, []);
      }
      acc.get(selection.categoryId)!.push(selection);
      return acc;
    }, new Map<string, DealerFitSelection[]>());
  }, [selections]);

  const handleOpenBrowser = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    setIsBrowserOpen(true);
  };
  
  const handleSaveSelection = async (selectionData: Omit<DealerFitSelection, 'id'>) => {
    if (!organisationId) {
        toast({ variant: 'destructive', title: 'Action Prohibited', description: 'Master data categories cannot store organisation-specific selections.' });
        return;
    }
    
    const colRef = collection(firestore, `organisations/${organisationId}/dealerFitSelections`);
    const dataToSave = {
        ...selectionData,
        createdAt: serverTimestamp(),
    };

    addDoc(colRef, dataToSave)
        .then(() => {
            toast({ title: 'Selection Added', description: `${selectionData.name} has been added to your local workspace.`});
            setIsBrowserOpen(false);
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: colRef.path,
                operation: 'create',
                requestResourceData: dataToSave,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
  };

  const loading = userLoading || orgLoading || categoriesLoading || selectionsLoading;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (assignedCategories.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-64 flex-col items-center justify-center text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-semibold">No Dealer Fit Categories Available</p>
          <p className="text-sm text-muted-foreground">
            {isAdmin 
                ? "Create master categories in the Admin panel to see them here."
                : "Your organisation has not been assigned any dealer fit categories yet."
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {assignedCategories.map(category => {
          const categorySelections = selectionsByCategory.get(category.id) || [];
          return (
            <Card key={category.id}>
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <CardTitle className="text-lg">{category.name}</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => handleOpenBrowser(category.id)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Selection
                </Button>
              </CardHeader>
              <CardContent>
                {categorySelections.length > 0 ? (
                  <Accordion type="multiple" className="w-full space-y-2">
                    {categorySelections.map(selection => (
                       <AccordionItem value={selection.id} key={selection.id} className="border-b-0">
                          <Card className="bg-muted/50 border-none shadow-none">
                            <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline">
                                <div className="flex items-center gap-2">
                                    <span className="text-primary">•</span>
                                    {selection.name} {selection.type === 'package' && `(${selection.items.length} items)`}
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                                <div className="space-y-2 ml-4 border-l pl-4">
                                    {selection.items.map((item, index) => (
                                        <div key={index} className="p-3 border rounded-md bg-background text-xs">
                                            <p className="font-bold">{item.data.Description || item.data.name || 'Unnamed Item'}</p>
                                            <p className="text-muted-foreground mt-1">Vendor ID: {item.vendorId}</p>
                                        </div>
                                    ))}
                                </div>
                            </AccordionContent>
                          </Card>
                       </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <div className="py-10 text-center text-xs text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
                    {allowedVendorIds.length > 0 
                        ? "Click 'Add Selection' to browse parts from your associated vendors." 
                        : "No associated vendors have been assigned to this module configuration."
                    }
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
       {activeCategoryId && (
        <MasterDataBrowserDialog
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
          organisation={(organisation || { id: organisationId || 'temp' }) as any}
          categoryId={activeCategoryId}
          onSave={handleSaveSelection}
          allowedVendorIds={allowedVendorIds}
        />
      )}
    </>
  );
}
