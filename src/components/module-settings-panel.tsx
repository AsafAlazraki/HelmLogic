'use client';

/**
 * Reusable Settings panel rendered on every module workspace's Settings
 * tab. Single source of truth so Trailer / Yamaha / Rego (and eventually
 * Boat) all have the same card set:
 *
 *   1. Module Image editor
 *   2. Module-specific cards (passed in via `preCards`)
 *   3. Associated Vendors — pick data-warehouse vendors this module
 *      pulls dealer-fit items / parts from
 *   4. Associated Modules — pick OTHER modules this module pulls from
 *      (v1.4 addition; lets a boat module reference the trailer module
 *      and auto-surface every trailer brand without duplicating)
 *   5. Module Dealer Fit Categories
 *   6. Sub Dealers
 *   7. Module Role Assignment (Brand Captain + Module Manager)
 */

import { useMemo, useState, type ReactNode } from 'react';
import { collection, doc, query, updateDoc, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Boxes, Building, Check, Globe, Layers, Pencil, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

import { ModuleImageEditor } from '@/components/module-image-editor';
import { ModuleDealerFitManager } from '@/components/module-dealer-fit-manager';
import { ModuleRoleAssignment } from '@/components/module-role-assignment';

interface Vendor {
    id: string;
    name: string;
    vendorType?: string;
    logoUrl?: string;
    shortCode?: string;
}

interface ModuleDoc {
    id: string;
    name?: string;
    mainVendorId?: string | null;
    moduleType?: string;
    associatedVendorIds?: string[];
    associatedModuleIds?: string[]; // v1.4 addition
    logoUrl?: string;
    brandCaptainUserId?: string;
    brandCaptainUserName?: string;
    moduleManagerUserId?: string;
    moduleManagerUserName?: string;
}

interface OrgDoc {
    id: string;
    name?: string;
    subDealersEnabled?: boolean;
    parentOrganisationId?: string | null;
    enabledModuleSubscriptions?: string[];
}

interface ModuleSettingsPanelProps {
    moduleId: string;
    moduleData: any;
    organisationId: string;
    isAdmin: boolean;
    /** Cards rendered ABOVE the standard card set (module-specific extras). */
    preCards?: ReactNode;
    /** Cards rendered BELOW Dealer Fit but ABOVE Sub Dealers (module-specific). */
    midCards?: ReactNode;
    /** Hide the Module Image card if a workspace doesn't want it. */
    showModuleImage?: boolean;
    /** Dealer-fit categories field on `modules/{id}` (default `moduleDealerFitCategories`). */
    dealerFitFieldName?: string;
    dealerFitTitle?: string;
    dealerFitDescription?: string;
    /** Hide the dealer-fit card entirely (e.g. Rego module doesn't want it). */
    showDealerFit?: boolean;
    /** Show the sub-dealers card (default true). */
    showSubDealers?: boolean;
}

export function ModuleSettingsPanel({
    moduleId,
    moduleData,
    organisationId,
    isAdmin,
    preCards,
    midCards,
    showModuleImage = true,
    dealerFitFieldName = 'moduleDealerFitCategories',
    dealerFitTitle = 'Module Dealer Fit Categories',
    dealerFitDescription = 'Categories for dealer-fit options attached to items in this module.',
    showDealerFit = true,
    showSubDealers = true,
}: ModuleSettingsPanelProps) {
    const moduleDoc: ModuleDoc = { id: moduleId, ...(moduleData || {}) };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
            {showModuleImage && (
                <ModuleImageEditor
                    moduleId={moduleId}
                    currentLogoUrl={moduleData?.logoUrl}
                    isAdmin={isAdmin}
                />
            )}

            {preCards}

            <AssociatedVendorsCard moduleDoc={moduleDoc} isAdmin={isAdmin} />

            <AssociatedModulesCard
                moduleDoc={moduleDoc}
                organisationId={organisationId}
                isAdmin={isAdmin}
            />

            {showDealerFit && (
                <ModuleDealerFitManager
                    moduleId={moduleId}
                    categories={moduleData?.[dealerFitFieldName] || []}
                    fieldName={dealerFitFieldName}
                    title={dealerFitTitle}
                    description={dealerFitDescription}
                />
            )}

            {midCards}

            {showSubDealers && (
                <SubDealersCard moduleDoc={moduleDoc} organisationId={organisationId} />
            )}

            <ModuleRoleAssignment
                moduleId={moduleId}
                organisationId={organisationId}
                currentBrandCaptain={
                    moduleData?.brandCaptainUserId
                        ? {
                              userId: moduleData.brandCaptainUserId,
                              userName: moduleData.brandCaptainUserName || '',
                          }
                        : null
                }
                currentModuleManager={
                    moduleData?.moduleManagerUserId
                        ? {
                              userId: moduleData.moduleManagerUserId,
                              userName: moduleData.moduleManagerUserName || '',
                          }
                        : null
                }
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Associated Vendors — pick data-warehouse vendors this module can pull from.
// ---------------------------------------------------------------------------

function AssociatedVendorsCard({
    moduleDoc,
    isAdmin,
}: {
    moduleDoc: ModuleDoc;
    isAdmin: boolean;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [editing, setEditing] = useState(false);

    const vendorsQuery = useMemoFirebase(
        () => collection(firestore, 'data-warehouse'),
        [firestore],
    );
    const { data: allVendors } = useCollection<Vendor>(vendorsQuery);

    const associatedVendors = useMemo(() => {
        if (!moduleDoc.associatedVendorIds || !allVendors) return [];
        return allVendors.filter(v => moduleDoc.associatedVendorIds?.includes(v.id));
    }, [moduleDoc.associatedVendorIds, allVendors]);

    const mainVendor = useMemo(
        () => allVendors?.find(v => v.id === moduleDoc.mainVendorId) || null,
        [allVendors, moduleDoc.mainVendorId],
    );

    async function toggleVendor(vendorId: string, on: boolean) {
        const current = moduleDoc.associatedVendorIds || [];
        const next = on
            ? [...new Set([...current, vendorId])]
            : current.filter(id => id !== vendorId);
        try {
            await updateDoc(doc(firestore, 'modules', moduleDoc.id), {
                associatedVendorIds: next,
            });
            const v = allVendors?.find(v => v.id === vendorId);
            toast({ title: on ? `${v?.name ?? 'Vendor'} added` : `${v?.name ?? 'Vendor'} removed` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to update', description: e?.message });
        }
    }

    return (
        <Card className="border-2 rounded-2xl">
            <CardHeader>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border-2 border-primary/20">
                            <Globe className="h-5 w-5" />
                        </div>
                        <div>
                            <CardTitle>Associated Vendors</CardTitle>
                            <CardDescription>
                                Which data-warehouse vendors this module can pull dealer-fit items, parts, and accessories from.
                            </CardDescription>
                        </div>
                    </div>
                    {isAdmin && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl border-2 text-[10px] font-black uppercase tracking-widest gap-1"
                            onClick={() => setEditing(true)}
                        >
                            <Pencil className="h-3 w-3" /> Edit
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {mainVendor && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border-2 border-primary/20 text-sm">
                        <Check className="h-4 w-4 text-primary" />
                        <span className="font-semibold">Main: {mainVendor.name}</span>
                    </div>
                )}
                {associatedVendors.length > 0 ? (
                    associatedVendors.map(v => (
                        <div
                            key={v.id}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm"
                        >
                            <Check className="h-4 w-4 text-green-600" />
                            <span>{v.name}</span>
                            {v.vendorType && (
                                <span className="text-[9px] text-slate-400 ml-auto">{v.vendorType}</span>
                            )}
                        </div>
                    ))
                ) : (
                    <p className="text-xs text-slate-400 italic py-2">
                        No associated vendors. {isAdmin ? 'Click Edit to add.' : ''}
                    </p>
                )}
            </CardContent>

            <Dialog open={editing} onOpenChange={setEditing}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">
                            Associated Vendors
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
                        {(allVendors || [])
                            .filter(v => v.id !== moduleDoc.mainVendorId)
                            .map(v => {
                                const isAssociated = (moduleDoc.associatedVendorIds || []).includes(v.id);
                                return (
                                    <div
                                        key={v.id}
                                        className={cn(
                                            'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                                            isAssociated ? 'border-primary bg-primary/5' : 'hover:border-slate-300',
                                        )}
                                        onClick={() => toggleVendor(v.id, !isAssociated)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isAssociated}
                                            readOnly
                                            className="rounded border-2"
                                        />
                                        <div>
                                            <p className="text-xs font-bold">{v.name}</p>
                                            {v.vendorType && (
                                                <p className="text-[9px] text-slate-400">{v.vendorType}</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button className="rounded-xl">Done</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Associated Modules — v1.4 addition. Pick OTHER modules this module pulls from.
// ---------------------------------------------------------------------------

function AssociatedModulesCard({
    moduleDoc,
    organisationId,
    isAdmin,
}: {
    moduleDoc: ModuleDoc;
    organisationId: string;
    isAdmin: boolean;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [editing, setEditing] = useState(false);

    // Every module the organisation has access to, except THIS one.
    // Modules in Firestore are a flat top-level collection so we filter on
    // the client — typical org has <50 modules, so this is fine.
    const modulesQuery = useMemoFirebase(
        () => collection(firestore, 'modules'),
        [firestore],
    );
    const { data: allModules } = useCollection<ModuleDoc>(modulesQuery);

    const associatedModules = useMemo(() => {
        if (!allModules) return [];
        const ids = new Set(moduleDoc.associatedModuleIds || []);
        return allModules.filter(m => ids.has(m.id));
    }, [allModules, moduleDoc.associatedModuleIds]);

    async function toggleModule(targetModuleId: string, on: boolean) {
        const current = moduleDoc.associatedModuleIds || [];
        const next = on
            ? [...new Set([...current, targetModuleId])]
            : current.filter(id => id !== targetModuleId);
        try {
            await updateDoc(doc(firestore, 'modules', moduleDoc.id), {
                associatedModuleIds: next,
            });
            const m = allModules?.find(m => m.id === targetModuleId);
            toast({ title: on ? `${m?.name ?? 'Module'} linked` : `${m?.name ?? 'Module'} unlinked` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to update', description: e?.message });
        }
    }

    const candidates = (allModules || []).filter(m => m.id !== moduleDoc.id);

    return (
        <Card className="border-2 rounded-2xl">
            <CardHeader>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border-2 border-primary/20">
                            <Layers className="h-5 w-5" />
                        </div>
                        <div>
                            <CardTitle>Associated Modules</CardTitle>
                            <CardDescription>
                                Other modules this one pulls from. Link the Trailer module to a boat module, and every trailer brand + dealer-fit category on the trailer module becomes available on the boat module's quote flow automatically.
                            </CardDescription>
                        </div>
                    </div>
                    {isAdmin && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl border-2 text-[10px] font-black uppercase tracking-widest gap-1"
                            onClick={() => setEditing(true)}
                        >
                            <Pencil className="h-3 w-3" /> Edit
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {associatedModules.length > 0 ? (
                    associatedModules.map(m => (
                        <div
                            key={m.id}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm"
                        >
                            <Check className="h-4 w-4 text-green-600" />
                            <span className="font-medium">{m.name}</span>
                            {m.moduleType && (
                                <span className="text-[9px] text-slate-400 ml-auto uppercase tracking-widest">
                                    {m.moduleType}
                                </span>
                            )}
                        </div>
                    ))
                ) : (
                    <p className="text-xs text-slate-400 italic py-2">
                        No associated modules. {isAdmin ? 'Click Edit to link another module.' : ''}
                    </p>
                )}
            </CardContent>

            <Dialog open={editing} onOpenChange={setEditing}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">
                            Associated Modules
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
                        {candidates.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-4 text-center">
                                No other modules available to link.
                            </p>
                        ) : (
                            candidates.map(m => {
                                const isAssociated = (moduleDoc.associatedModuleIds || []).includes(m.id);
                                return (
                                    <div
                                        key={m.id}
                                        className={cn(
                                            'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                                            isAssociated ? 'border-primary bg-primary/5' : 'hover:border-slate-300',
                                        )}
                                        onClick={() => toggleModule(m.id, !isAssociated)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isAssociated}
                                            readOnly
                                            className="rounded border-2"
                                        />
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Boxes className="h-4 w-4 text-slate-400 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold truncate">{m.name}</p>
                                                {m.moduleType && (
                                                    <p className="text-[9px] text-slate-400 uppercase tracking-widest">
                                                        {m.moduleType}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button className="rounded-xl">Done</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Sub Dealers — lists every sub-dealer of the current org and toggles
// whether they can see this module.
// ---------------------------------------------------------------------------

function SubDealersCard({
    moduleDoc,
    organisationId,
}: {
    moduleDoc: ModuleDoc;
    organisationId: string;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const orgDocQuery = useMemoFirebase(
        () => doc(firestore, 'organisations', organisationId),
        [firestore, organisationId],
    );
    // Load the parent org to check `subDealersEnabled`. We use `useCollection`
    // at a narrow query rather than a doc loader to keep imports simple.
    const parentOrgQuery = useMemoFirebase(
        () => query(collection(firestore, 'organisations'), where('__name__', '==', organisationId)),
        [firestore, organisationId],
    );
    const { data: parentOrgs } = useCollection<OrgDoc>(parentOrgQuery);
    const parentOrg = parentOrgs?.[0];

    // Sub-dealers of the current org.
    const subDealersQuery = useMemoFirebase(
        () => query(collection(firestore, 'organisations'), where('parentOrganisationId', '==', organisationId)),
        [firestore, organisationId],
    );
    const { data: subDealers } = useCollection<OrgDoc>(subDealersQuery);

    // Only render the card when sub-dealers are enabled at the parent level —
    // otherwise it's dead weight.
    if (!parentOrg?.subDealersEnabled) return null;

    async function toggleSubDealerAccess(subDealerId: string, on: boolean) {
        const sd = subDealers?.find(s => s.id === subDealerId);
        const current = sd?.enabledModuleSubscriptions || [];
        const next = on
            ? [...new Set([...current, moduleDoc.id])]
            : current.filter(id => id !== moduleDoc.id);
        try {
            await updateDoc(doc(firestore, 'organisations', subDealerId), {
                enabledModuleSubscriptions: next,
            });
            toast({ title: on ? `${sd?.name ?? 'Sub-dealer'} access granted` : `${sd?.name ?? 'Sub-dealer'} access revoked` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to update', description: e?.message });
        }
    }

    return (
        <Card className="border-2 rounded-2xl">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border-2 border-primary/20">
                        <Users className="h-5 w-5" />
                    </div>
                    <div>
                        <CardTitle>Sub Dealers</CardTitle>
                        <CardDescription>
                            Which sub-dealers can see this module.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {!subDealers || subDealers.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">No sub-dealers configured.</p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {subDealers.map(sd => {
                            const hasAccess = sd.enabledModuleSubscriptions?.includes(moduleDoc.id);
                            return (
                                <div
                                    key={sd.id}
                                    className={cn(
                                        'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                                        hasAccess ? 'border-primary bg-primary/5' : 'hover:border-slate-300 opacity-70',
                                    )}
                                    onClick={() => toggleSubDealerAccess(sd.id, !hasAccess)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!!hasAccess}
                                        readOnly
                                        className="rounded border-2"
                                    />
                                    <div className="h-8 w-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                                        <Building className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <span className="text-xs font-medium truncate">{sd.name ?? sd.id}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
