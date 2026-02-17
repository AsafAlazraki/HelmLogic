'use client';

import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc, collection } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Loader2, Blocks } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";

interface UserProfile {
    appRole?: string;
    organisationId?: string;
    organisationRole?: string;
}

interface Organisation {
    id: string;
    name: string;
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
        if (!roleId || !organisation?.permissions?.[roleId]) return { can_access_module: false };
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {subscribedModules.length > 0 ? (
                subscribedModules.map((module) => (
                    <Link href={`/modules/${module.slug || module.id}`} key={module.id} className="group">
                        <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:-translate-y-1 group-hover:shadow-xl overflow-hidden flex flex-col">
                            <CardHeader className="h-28 bg-secondary flex items-center justify-center p-4">
                                {module.logoUrl ? (
                                    <div className="relative h-full w-full">
                                        <Image src={module.logoUrl} alt={`${module.name} logo`} fill className="object-contain p-2" />
                                    </div>
                                ) : (
                                    <Blocks className="h-10 w-10 text-muted-foreground"/>
                                )}
                            </CardHeader>
                            <CardContent className="p-4 flex-grow flex items-center justify-center">
                                <CardTitle className="text-lg text-center">{module.name}</CardTitle>
                            </CardContent>
                        </Card>
                    </Link>
                ))
            ) : (
                 <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
                    <Card className="flex flex-col items-center justify-center h-80 border-2 border-dashed">
                        <Blocks className="h-16 w-16 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-semibold">No Modules Available</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {userPermissions.can_access_module 
                                ? "Your organisation does not have access to any modules yet."
                                : "Your role does not have permission to access modules."
                            }
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">Please contact your administrator.</p>
                    </Card>
                </div>
            )}
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
            <div className="flex h-[400px] w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Dashboard</h1>
                <BreadcrumbNav />
            </div>
            {organisationId && userProfile ? <EmployeeDashboard organisationId={organisationId} userProfile={userProfile} /> : <p>You are not part of an organisation.</p>}
        </div>
    );
}