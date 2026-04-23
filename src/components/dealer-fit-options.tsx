'use client';

import { useMemo, useState } from 'react';
import { useCollection, useDoc, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertCircle, PlusCircle, Trash2, Zap, Box, Layers, ChevronRight } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from './ui/button';
import { MasterDataBrowserDialog } from './master-data-browser-dialog';
import { collection, addDoc, serverTimestamp, doc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { cn } from '@/lib/utils';

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
    isAdmin,
    moduleOnly = false
}: {
    module: any;
    organisationId?: string;
    isAdmin?: boolean;
    moduleOnly?: boolean;
}) {
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
  const [isSeeding, setIsSeeding] = useState<string | null>(null);

  // v1.4 Stage B.2 — resolve modules linked via `associatedModuleIds`.
  // DF categories and associated vendors defined on those linked modules
  // get unioned into the current module's pool, so a boat module that
  // links the Trailer module instantly inherits every trailer brand +
  // trailer DF category without duplicate wiring.
  const associatedModuleIds = useMemo<string[]>(
    () => Array.isArray(module?.associatedModuleIds) ? module.associatedModuleIds : [],
    [module?.associatedModuleIds],
  );
  const modulesQuery = useMemoFirebase(
    () => (associatedModuleIds.length > 0 ? collection(firestore, 'modules') : null),
    [firestore, associatedModuleIds.length],
  );
  const { data: allModules } = useCollection<any>(modulesQuery);
  const linkedModules = useMemo(() => {
    if (!allModules || associatedModuleIds.length === 0) return [];
    const allow = new Set(associatedModuleIds);
    return allModules.filter((m: any) => allow.has(m.id));
  }, [allModules, associatedModuleIds]);

  const assignedCategories = useMemo(() => {
    // moduleOnly mode: only show this module's own categories in defined order
    if (moduleOnly) {
      const moduleCats: string[] = module?.moduleDealerFitCategories || [];
      return moduleCats.map(name => ({ id: `module-${name}`, name } as DealerFitCategory));
    }
    const cats: DealerFitCategory[] = [];
    // Global categories (from dealerFitCategories collection)
    if (allCategories) {
      if (isAdmin) {
        cats.push(...allCategories);
      } else if (organisation?.dealerFitCategories) {
        cats.push(...allCategories.filter(cat => organisation.dealerFitCategories?.includes(cat.id)));
      }
    }
    // Module-level boat dealer fit categories
    const moduleCats: string[] = module?.moduleDealerFitCategories || [];
    moduleCats.forEach(name => {
      if (!cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        cats.push({ id: `module-${name}`, name } as DealerFitCategory);
      }
    });
    // Module-level motor dealer fit categories
    const motorCats: string[] = module?.motorDealerFitCategories || [];
    motorCats.forEach(name => {
      if (!cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        cats.push({ id: `motor-${name}`, name } as DealerFitCategory);
      }
    });
    // Module-level trailer dealer fit categories
    const trailerCats: string[] = module?.trailerDealerFitCategories || [];
    trailerCats.forEach(name => {
      if (!cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        cats.push({ id: `trailer-${name}`, name } as DealerFitCategory);
      }
    });
    // v1.4 Stage B.2 — categories from associated modules. Every DF field on
    // every linked module is merged in (deduped by case-insensitive name).
    for (const lm of linkedModules) {
      for (const src of ['moduleDealerFitCategories', 'motorDealerFitCategories', 'trailerDealerFitCategories'] as const) {
        const names: string[] = lm?.[src] || [];
        for (const name of names) {
          if (!cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            // Prefix with `linked-` so the synthetic category IDs don't
            // collide with local module ones on re-bind.
            cats.push({ id: `linked-${name}`, name } as DealerFitCategory);
          }
        }
      }
    }
    return cats;
  }, [allCategories, organisation, isAdmin, module, moduleOnly, linkedModules]);

  const activeCategory = useMemo(() => {
    return assignedCategories.find(c => c.id === activeCategoryId);
  }, [assignedCategories, activeCategoryId]);

  const allowedVendorIds = useMemo(() => {
    if (!module) return [];
    const ids = new Set<string>();
    (module.associatedVendorIds || []).forEach((id: string) => {
      if (id !== module.mainVendorId) ids.add(id);
    });
    // v1.4 Stage B.2 — also include associated vendors from every linked
    // module, minus the current module's main vendor. Lets dealer-fit items
    // flow in from vendors that are only wired up on the linked module.
    for (const lm of linkedModules) {
      (lm?.associatedVendorIds || []).forEach((id: string) => {
        if (id !== module.mainVendorId) ids.add(id);
      });
      if (lm?.mainVendorId && lm.mainVendorId !== module.mainVendorId) {
        ids.add(lm.mainVendorId);
      }
    }
    return Array.from(ids);
  }, [module, linkedModules]);

  const selectionsByCategory = useMemo(() => {
    if (!selections) return new Map<string, DealerFitSelection[]>();
    const byId = new Map<string, DealerFitSelection[]>();
    const byName = new Map<string, DealerFitSelection[]>();
    selections.forEach(selection => {
      // Group by categoryId (for global categories)
      if (!byId.has(selection.categoryId)) byId.set(selection.categoryId, []);
      byId.get(selection.categoryId)!.push(selection);
      // Group by category name (for module-level synthetic categories)
      const catName = (selection.category || '').toLowerCase();
      if (catName) {
        if (!byName.has(catName)) byName.set(catName, []);
        byName.get(catName)!.push(selection);
      }
    });
    // Merge: for synthetic module/motor IDs, look up by name
    const merged = new Map(byId);
    assignedCategories.forEach(cat => {
      if ((cat.id.startsWith('module-') || cat.id.startsWith('motor-') || cat.id.startsWith('trailer-')) && !merged.has(cat.id)) {
        const nameMatches = byName.get(cat.name.toLowerCase()) || [];
        if (nameMatches.length > 0) merged.set(cat.id, nameMatches);
      }
    });
    return merged;
  }, [selections, assignedCategories]);

  const handleOpenBrowser = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    setIsBrowserOpen(true);
  };

  const handleClearAll = async () => {
    if (!organisationId) return;
    try {
        const snap = await getDocs(collection(firestore, `organisations/${organisationId}/dealerFitSelections`));
        const batch = writeBatch(firestore);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        toast({ title: 'All dealer fit options cleared' });
    } catch (error) {
        console.error('Clear all failed:', error);
        toast({ variant: 'destructive', title: 'Failed to clear' });
    }
  };

  const handleClearCategory = async (categoryId: string) => {
    if (!organisationId) return;
    const q = query(
        collection(firestore, `organisations/${organisationId}/dealerFitSelections`),
        where('categoryId', '==', categoryId)
    );
    try {
        const snap = await getDocs(q);
        const batch = writeBatch(firestore);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        toast({ title: "Category Purged", description: "All local selections have been removed." });
    } catch (e) {
        toast({ variant: 'destructive', title: "Clear Failed" });
    }
  };

  const handleSeedCategory = async (category: DealerFitCategory) => {
    if (!organisationId) return;
    setIsSeeding(category.id);
    const colRef = collection(firestore, `organisations/${organisationId}/dealerFitSelections`);
    
    let demoItems: any[] = [];
    const name = category.name.toLowerCase();

    if (name.includes('safety')) {
        demoItems = [
            { name: 'Lifejacket (PFD Level 100)', type: 'item', items: [{ data: { Description: 'Lifejacket PFD Level 100 Adult', sellPriceExclGst: 85 }}] },
            { name: 'Sand Anchor Kit', type: 'item', items: [{ data: { Description: 'Sand Anchor, Chain & Rope Kit', sellPriceExclGst: 145 }}] },
            { name: 'Flare Kit (Inshore)', type: 'item', items: [{ data: { Description: 'Inshore Flare Kit - Red & Orange Hand', sellPriceExclGst: 65 }}] }
        ];
    } else if (name.includes('sounder')) {
        demoItems = [
            { name: 'Garmin EchoMAP 95sv', type: 'item', items: [{ data: { Description: 'Garmin EchoMAP 95sv with Transducer', sellPriceExclGst: 1850 }}] }
        ];
    } else if (name.includes('audio')) {
        demoItems = [
            { name: 'Fusion MS-RA210 System', type: 'item', items: [{ data: { Description: 'Fusion RA210 Marine Stereo & Speakers', sellPriceExclGst: 650 }}] }
        ];
    }

    try {
        for (const item of demoItems) {
            await addDoc(colRef, {
                ...item,
                categoryId: category.id,
                category: category.name,
                createdAt: serverTimestamp()
            });
        }
        toast({ title: "Demo Data Injected", description: `${category.name} has been populated.` });
    } catch (e) {
        toast({ variant: 'destructive', title: "Sync Failed" });
    } finally {
        setIsSeeding(null);
    }
  };
  
  const handleSaveSelection = async (selectionData: Omit<DealerFitSelection, 'id'>) => {
    if (!organisationId) return;
    const colRef = collection(firestore, `organisations/${organisationId}/dealerFitSelections`);
    const dataToSave = { ...selectionData, createdAt: serverTimestamp() };

    addDoc(colRef, dataToSave)
        .then(() => {
            toast({ title: 'Selection Added' });
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

  const loading = orgLoading || categoriesLoading || selectionsLoading;

  if (loading) {
    return (
      <Card className="rounded-xl border-2 shadow-sm">
        <CardContent className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6 text-left">
        {selections && selections.length > 0 && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="rounded-xl border-2 border-destructive/30 text-destructive text-[10px] font-black uppercase tracking-widest gap-1" onClick={handleClearAll}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </Button>
          </div>
        )}
        {assignedCategories.map(category => {
          const categorySelections = selectionsByCategory.get(category.id) || [];
          const nameLower = category.name.toLowerCase();
          const hasSeeder = nameLower.includes('safety') || nameLower.includes('sounder') || nameLower.includes('audio');

          return (
            <Card key={category.id} className="rounded-xl border-2 shadow-sm overflow-hidden text-left">
              <CardHeader className="flex flex-row items-center justify-between py-4 px-6 bg-muted/10 border-b text-left shrink-0">
                <div className="text-left">
                    <CardTitle className="text-lg font-black uppercase italic tracking-tight">{category.name}</CardTitle>
                    <CardDescription className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{categorySelections.length} Active Proposals</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-left">
                    {categorySelections.length > 0 && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-4 font-black uppercase text-[9px] tracking-widest text-destructive hover:bg-destructive/10"
                            onClick={() => handleClearCategory(category.id)}
                        >
                            <Trash2 className="h-3 w-3 mr-1.5" />
                            Clear All
                        </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" className="h-8 px-4 font-black uppercase text-[9px] tracking-widest border-2" onClick={() => handleOpenBrowser(category.id)}>
                        <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                        Add Selection
                    </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6 text-left">
                {categorySelections.length > 0 ? (
                  <div className="grid gap-3 text-left">
                    {categorySelections.map(selection => (
                        <Card key={selection.id} className="bg-slate-50 border-2 hover:border-primary/20 transition-all shadow-sm group/sel rounded-xl overflow-hidden text-left">
                            <div className="p-4 flex items-center justify-between text-left">
                                <div className="flex items-center gap-3 text-left">
                                    <div className="h-8 w-8 bg-white border-2 rounded-lg flex items-center justify-center text-primary/40 shadow-inner group-hover/sel:text-primary group-hover/sel:border-primary/20 transition-all">
                                        {selection.type === 'package' ? <Layers className="h-4 w-4" /> : <Box className="h-4 w-4" />}
                                    </div>
                                    <div className="text-left">
                                        <p className="font-black text-xs uppercase tracking-tight text-slate-900">{selection.name}</p>
                                        <p className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-widest">{selection.items.length} Components Staged</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 text-left">
                                    <div className="text-right text-left">
                                        <p className="text-[10px] font-black text-primary">AUD BASE</p>
                                        <p className="font-black text-xs">${selection.items.reduce((acc, i) => acc + (i.data.sellPriceExclGst || 0), 0).toLocaleString()}</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-slate-300" />
                                </div>
                            </div>
                        </Card>
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center flex flex-col items-center gap-4 border-2 border-dashed rounded-2xl bg-muted/5 opacity-40 text-left">
                    <Box className="h-10 w-10 text-muted-foreground" />
                    <div className="text-left">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Strategic Selection Matrix Empty</p>
                        <p className="text-[8px] font-bold uppercase text-muted-foreground/60 mt-1">Browse master data to link items to this category</p>
                    </div>
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
          initialCategory={activeCategory?.name}
          onSave={handleSaveSelection}
          allowedVendorIds={allowedVendorIds}
        />
      )}
    </>
  );
}
