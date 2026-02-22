'use client';

import { useMemo, useState } from 'react';
import { useCollection, useDoc, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, AlertCircle, PlusCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from './ui/button';
import { MasterDataBrowserDialog } from './master-data-browser-dialog';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';

interface DealerFitCategory {
  id: string;
  name: string;
}

interface Organisation {
  id: string;
  dealerFitCategories?: string[];
  dataWarehouseSubscriptions?: string[];
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

export function DealerFitOptions({ module, organisationId }: { module: any; organisationId?: string }) {
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  
  const orgRef = useMemoFirebase(() => organisationId ? doc(firestore, 'organisations', organisationId) : null, [firestore, organisationId]);
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
    if (!allCategories || !organisation?.dealerFitCategories) return [];
    return allCategories.filter(cat => organisation.dealerFitCategories?.includes(cat.id));
  }, [allCategories, organisation]);

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
    if (!organisationId) return;
    try {
        await addDoc(collection(firestore, `organisations/${organisationId}/dealerFitSelections`), {
            ...selectionData,
            createdAt: serverTimestamp(),
        });
        toast({ title: 'Selection Added', description: `${selectionData.name} has been added.`});
        setIsBrowserOpen(false);
    } catch (error) {
        console.error("Failed to save selection: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not save selection.'});
    }
  };

  const loading = userLoading || orgLoading || categoriesLoading || selectionsLoading;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (assignedCategories.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-64 flex-col items-center justify-center text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-semibold">No Dealer Fit Categories Assigned</p>
          <p className="text-sm text-muted-foreground">
            An admin needs to assign dealer fit categories to this organisation.
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{category.name}</CardTitle>
                <Button variant="outline" size="sm" onClick={() => handleOpenBrowser(category.id)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Selection
                </Button>
              </CardHeader>
              <CardContent>
                {categorySelections.length > 0 ? (
                  <Accordion type="multiple" className="w-full space-y-2">
                    {categorySelections.map(selection => (
                       <AccordionItem value={selection.id} key={selection.id} className="border-b-0">
                          <Card className="bg-muted/50">
                            <AccordionTrigger className="p-4 text-base font-semibold">
                                {selection.name} {selection.type === 'package' && `(${selection.items.length} items)`}
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                                <div className="space-y-2">
                                    {selection.items.map((item, index) => (
                                        <div key={index} className="p-2 border rounded-md bg-background text-sm">
                                            <p className="font-medium">{item.data.Description || item.data.name || 'Unnamed Item'}</p>
                                            <p className="text-xs text-muted-foreground">Vendor: {item.vendorId}</p>
                                        </div>
                                    ))}
                                </div>
                            </AccordionContent>
                          </Card>
                       </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                    No selections added to this category yet.
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
       {activeCategoryId && organisation && (
        <MasterDataBrowserDialog
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
          organisation={organisation}
          categoryId={activeCategoryId}
          onSave={handleSaveSelection}
        />
      )}
    </>
  );
}