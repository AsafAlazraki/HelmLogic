'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc, collection } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Loader2, Blocks, LayoutGrid, Ship, ArrowRight, ShieldCheck, User } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface UserProfile {
    displayName?: string;
    appRole?: string;
    organisationId?: string;
    organisationRole?: string;
}

interface Organisation {
    id: string;
    name: string;
    primaryLogoUrl?: string;
    enabledModuleSubscriptions?: string[];
    permissions?: Record<string, Record<string, boolean>>;
}

interface Module {
    id: string;
    name: string;
    slug?: string;
    logoUrl?: string;
}

function EmployeeDashboard({ organisationId, userProfile }: { organisationId: string, userProfile: UserProfile }) {
    const firestore = useFirestore();
    
    const orgRef = useMemoFirebase(() => organisationId ? doc(firestore, 'organisations', organisationId) : null, [firestore, organisationId]);
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(orgRef);
    
    const modulesQuery = useMemoFirebase(() => collection(firestore, 'modules'), [firestore]);
    const { data: allModules, loading: modulesLoading } = useCollection<Module>(modulesQuery);

    const userPermissions = useMemo(() => {
        const roleId = userProfile?.organisationRole;
        if (!roleId || !organisation?.permissions?.[roleId]) return { can_access_module: false, can_access_settings: false };
        return organisation.permissions[roleId];
    }, [userProfile, organisation]);

    const subscribedModuleIds = useMemo(() => organisation?.enabledModuleSubscriptions || [], [organisation]);

    const subscribedModules = useMemo(() => {
        if (!allModules || subscribedModuleIds.length === 0 || !userPermissions.can_access_module) return [];
        return allModules.filter(module => subscribedModuleIds.includes(module.id));
    }, [allModules, subscribedModuleIds, userPermissions]);

    const loading = orgLoading || modulesLoading;

    if (loading) {
        return (
            <div className="flex h-[400px] w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Hero Welcome Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-accent p-6 text-primary-foreground shadow-xl border border-white/10">
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
                            <Ship className="h-3 w-3" />
                            <span>HelmLogic Workspace</span>
                        </div>
                        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                            Welcome, {userProfile?.displayName?.split(' ')[0] || 'Bill'}
                        </h1>
                        <p className="text-base font-medium opacity-80 max-w-xl leading-relaxed">
                            Your unified hub for maritime operations and intelligence.
                        </p>
                    </div>

                    <div className="shrink-0 flex flex-col items-center md:items-end gap-2.5">
                        {/* Refined Glassmorphism Logo Container */}
                        <div className="h-20 w-20 relative bg-white/10 backdrop-blur-md rounded-2xl p-2.5 border border-white/20 shadow-2xl group hover:scale-105 transition-all">
                            {organisation?.primaryLogoUrl ? (
                                <Image 
                                    src={organisation.primaryLogoUrl} 
                                    alt={`${organisation.name} logo`} 
                                    fill 
                                    className="object-contain p-2" 
                                />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                    <Blocks className="h-8 w-8 text-white opacity-40"/>
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-black uppercase tracking-widest">{organisation?.name}</p>
                            <div className="flex items-center justify-end gap-1.5 mt-0.5 opacity-60">
                                <ShieldCheck className="h-2.5 w-2.5" />
                                <span className="text-[9px] font-bold uppercase">Verified Network</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modules Grid */}
            <div className="space-y-6">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                            <LayoutGrid className="h-4 w-4" />
                        </div>
                        <h2 className="text-xl font-black uppercase tracking-tight">My Modules</h2>
                    </div>
                    <div className="h-[1px] flex-1 mx-6 bg-border hidden sm:block" />
                    {userPermissions.can_access_settings && (
                        <Link href="/manage" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 group">
                            Settings
                            <ArrowRight className="h-3 w-3 transform transition-transform group-hover:translate-x-1" />
                        </Link>
                    )}
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {subscribedModules.length > 0 ? (
                        subscribedModules.map((module) => (
                            <Link href={`/modules/${module.slug || module.id}`} key={module.id} className="group">
                                <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:-translate-y-2 group-hover:shadow-2xl overflow-hidden flex flex-col rounded-2xl border-2">
                                    <CardHeader className="h-32 bg-muted/30 flex items-center justify-center p-6 border-b relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {module.logoUrl ? (
                                            <div className="relative h-full w-full">
                                                <Image src={module.logoUrl} alt={`${module.name} logo`} fill className="object-contain p-2" />
                                            </div>
                                        ) : (
                                            <Blocks className="h-12 w-12 text-muted-foreground opacity-20"/>
                                        )}
                                    </CardHeader>
                                    <CardContent className="p-5 flex-grow flex flex-col justify-between gap-4">
                                        <div className="space-y-2">
                                            <CardTitle className="text-lg font-black uppercase tracking-tight leading-tight">{module.name}</CardTitle>
                                            <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">
                                                {module.name.toLowerCase().includes('outboard') || module.name.toLowerCase().includes('motor') 
                                                    ? "Manage engine technical specs, factory rigging, and propellers." 
                                                    : "Configure boat packages, BMT options, and generate sales quotes."}
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between pt-4 border-t border-dashed">
                                            <span className="text-[10px] font-black uppercase tracking-tighter text-primary">Enter Module</span>
                                            <ArrowRight className="h-4 w-4 text-primary transform -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))
                    ) : (
                        <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
                            <Card className="flex flex-col items-center justify-center h-80 border-2 border-dashed rounded-3xl bg-muted/5">
                                <Blocks className="h-16 w-16 text-muted-foreground/20" />
                                <h3 className="mt-4 text-lg font-black uppercase tracking-widest text-muted-foreground">No Active Modules</h3>
                                <p className="mt-2 text-sm text-muted-foreground text-center max-w-xs">
                                    {userPermissions.can_access_module 
                                        ? "Your organisation hasn't subscribed to any modules yet. Contact support to get started."
                                        : "Your role does not have permission to access organisation modules."
                                    }
                                </p>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


export default function Dashboard() {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(userProfileRef);
    const router = useRouter();

    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';
    const organisationId = userProfile?.organisationId;
    const isLoading = userLoading || profileLoading;

    useEffect(() => {
        if (!isLoading && isAdmin) {
            router.replace('/admin');
        }
    }, [isLoading, isAdmin, router]);

    if (isLoading || isAdmin) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="max-w-7xl mx-auto py-2">
            {organisationId && userProfile ? (
                <EmployeeDashboard organisationId={organisationId} userProfile={userProfile} />
            ) : (
                <div className="flex flex-col items-center justify-center h-[60vh] border-2 border-dashed rounded-3xl bg-muted/5 animate-in fade-in">
                    <User className="h-20 w-20 text-muted-foreground opacity-10" />
                    <h3 className="mt-6 text-2xl font-black uppercase tracking-widest text-muted-foreground/40">Welcome to HelmLogic</h3>
                    <p className="mt-2 text-sm text-muted-foreground font-bold uppercase tracking-tighter opacity-60">Pending Organisation Association</p>
                </div>
            )}
        </div>
    );
}
