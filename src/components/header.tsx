'use client';

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFirestore } from "@/firebase/provider";
import { useCollection } from "@/firebase/firestore/use-collection";
import { doc, setDoc } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { useToast } from "@/hooks/use-toast";


const UserMenu = dynamic(() => import('@/components/user-menu').then(mod => mod.UserMenu), {
  ssr: false,
  loading: () => <Skeleton className="h-8 w-8 rounded-full" />,
});

interface Organisation {
    id: string;
    name: string;
    roles?: { id: string; name: string; parent: string }[];
}

export function Header() {
  const { user } = useUser();
  const { data: userProfile, loading: profileLoading } = useDoc<{ appRole: string, organisationId?: string }>(user ? `/users/${user.uid}` : null);
  const { data: organisations, loading: orgsLoading } = useCollection<Organisation>('organisations');
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleRoleChange = async (value: string) => {
    if (!user) return;
    const userRef = doc(firestore, "users", user.uid);

    try {
        if (value === 'admin') {
            const dataToUpdate = {
                appRole: 'HelmLogic Admin',
                organisationId: null,
                organisationRole: null,
            };
            await setDoc(userRef, dataToUpdate, { merge: true });
            toast({ title: "Role updated", description: "Switched to HelmLogic Admin." });

        } else if (value === 'employee') {
            const northsideMarine = organisations?.find(o => o.name === 'Northside Marine');
            if (northsideMarine && northsideMarine.roles && northsideMarine.roles.length > 0) {
                // Find Managing Director role or fallback to first
                const mdRole = northsideMarine.roles.find(r => r.name === 'Managing Director') || northsideMarine.roles[0];
                const dataToUpdate = {
                    appRole: 'General User',
                    organisationId: northsideMarine.id,
                    organisationRole: mdRole.id,
                };
                await setDoc(userRef, dataToUpdate, { merge: true });
                toast({ title: "Role updated", description: `Switched to Northside Marine ${mdRole.name}.` });
            } else {
                toast({ 
                    variant: "destructive", 
                    title: "Cannot switch role", 
                    description: "Northside Marine organisation or roles not found." 
                });
            }
        }
    } catch (error: any) {
        console.error("Failed to switch role:", error);
        toast({ 
            variant: "destructive", 
            title: "Role switch failed", 
            description: "An error occurred while updating your role." 
        });
        
        if (error.code === 'permission-denied') {
             const permissionError = new FirestorePermissionError({
                path: userRef.path, operation: 'update', 
            });
            errorEmitter.emit('permission-error', permissionError);
        }
    }
  };

  const northsideMarineOrg = organisations?.find(o => o.name === 'Northside Marine');
  const isEmployeeOptionDisabled = !northsideMarineOrg || !northsideMarineOrg.roles || northsideMarineOrg.roles.length === 0;
  
  const getCurrentRole = () => {
    if (userProfile?.appRole === 'HelmLogic Admin') {
        return 'admin';
    }
    if (userProfile?.organisationId && northsideMarineOrg && userProfile.organisationId === northsideMarineOrg.id) {
        return 'employee';
    }
    return '';
  };
  
  const loading = profileLoading || orgsLoading;
  const currentRole = getCurrentRole();

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-card px-4 sm:px-6">
      <SidebarTrigger className="-ml-[0.375rem]" />
      <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
        <span>Role:</span>
        {loading ? (
            <Skeleton className="h-8 w-48" />
        ) : user ? (
            <Select onValueChange={handleRoleChange} value={currentRole}>
                <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Select test role" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="admin">HelmLogic Admin</SelectItem>
                    <SelectItem value="employee" disabled={isEmployeeOptionDisabled}>
                        Northside Marine Employee
                    </SelectItem>
                </SelectContent>
            </Select>
        ) : null}
      </div>
      <UserMenu />
    </header>
  )
}
