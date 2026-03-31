'use client';

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, where, query } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, UserCog, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ModuleRoleAssignmentProps {
  moduleId: string;
  organisationId: string;
  currentBrandCaptain?: { userId: string; userName: string } | null;
  currentModuleManager?: { userId: string; userName: string } | null;
}

interface OrgMember {
  id: string;
  displayName?: string;
  name?: string;
  email?: string;
  organisationId: string;
}

export function ModuleRoleAssignment({
  moduleId,
  organisationId,
  currentBrandCaptain,
  currentModuleManager,
}: ModuleRoleAssignmentProps) {
  const firestore = useFirestore();
  const [savingBrandCaptain, setSavingBrandCaptain] = useState(false);
  const [savingModuleManager, setSavingModuleManager] = useState(false);

  const membersQuery = useMemoFirebase(() => {
    if (!organisationId) return null;
    return query(
      collection(firestore, 'users'),
      where('organisationId', '==', organisationId),
    );
  }, [firestore, organisationId]);

  const { data: members, loading: membersLoading } = useCollection<OrgMember>(membersQuery);

  const getMemberName = (member: OrgMember): string => {
    return member.displayName || member.name || member.email || member.id;
  };

  const handleBrandCaptainChange = async (userId: string) => {
    if (!moduleId) return;
    setSavingBrandCaptain(true);
    try {
      const selectedMember = members?.find((m) => m.id === userId);
      if (!selectedMember) return;

      const moduleRef = doc(firestore, 'modules', moduleId);
      await updateDoc(moduleRef, {
        brandCaptainUserId: selectedMember.id || null,
        brandCaptainUserName: getMemberName(selectedMember) || null,
      });

      toast({ title: 'Brand Captain Updated', description: `Assigned to ${getMemberName(selectedMember)}` });
    } catch (error) {
      console.error('Failed to update Brand Captain:', error);
      toast({ title: 'Error', description: 'Failed to update Brand Captain', variant: 'destructive' });
    } finally {
      setSavingBrandCaptain(false);
    }
  };

  const handleClearBrandCaptain = async () => {
    if (!moduleId) return;
    setSavingBrandCaptain(true);
    try {
      const moduleRef = doc(firestore, 'modules', moduleId);
      await updateDoc(moduleRef, {
        brandCaptainUserId: null,
        brandCaptainUserName: null,
      });

      toast({ title: 'Brand Captain Cleared' });
    } catch (error) {
      console.error('Failed to clear Brand Captain:', error);
      toast({ title: 'Error', description: 'Failed to clear Brand Captain', variant: 'destructive' });
    } finally {
      setSavingBrandCaptain(false);
    }
  };

  const handleModuleManagerChange = async (userId: string) => {
    if (!moduleId) return;
    setSavingModuleManager(true);
    try {
      const selectedMember = members?.find((m) => m.id === userId);
      if (!selectedMember) return;

      const moduleRef = doc(firestore, 'modules', moduleId);
      await updateDoc(moduleRef, {
        moduleManagerUserId: selectedMember.id || null,
        moduleManagerUserName: getMemberName(selectedMember) || null,
      });

      toast({ title: 'Module Manager Updated', description: `Assigned to ${getMemberName(selectedMember)}` });
    } catch (error) {
      console.error('Failed to update Module Manager:', error);
      toast({ title: 'Error', description: 'Failed to update Module Manager', variant: 'destructive' });
    } finally {
      setSavingModuleManager(false);
    }
  };

  const handleClearModuleManager = async () => {
    if (!moduleId) return;
    setSavingModuleManager(true);
    try {
      const moduleRef = doc(firestore, 'modules', moduleId);
      await updateDoc(moduleRef, {
        moduleManagerUserId: null,
        moduleManagerUserName: null,
      });

      toast({ title: 'Module Manager Cleared' });
    } catch (error) {
      console.error('Failed to clear Module Manager:', error);
      toast({ title: 'Error', description: 'Failed to clear Module Manager', variant: 'destructive' });
    } finally {
      setSavingModuleManager(false);
    }
  };

  return (
    <Card className="border-2 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-xs font-bold flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Module Roles
        </CardTitle>
        <CardDescription className="text-[9px] uppercase tracking-widest font-black text-slate-400">
          Assign key roles for this module
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Brand Captain */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
              Brand Captain
            </span>
            {currentBrandCaptain && (
              <Badge variant="secondary" className="text-[9px] ml-auto">
                {currentBrandCaptain.userName}
              </Badge>
            )}
          </div>
          <p className="text-[9px] text-slate-400 mb-2">
            Receives hold requests from sub-dealers
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={currentBrandCaptain?.userId || ''}
              onValueChange={handleBrandCaptainChange}
              disabled={membersLoading || savingBrandCaptain}
            >
              <SelectTrigger className="rounded-xl border-2 h-10 flex-1">
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                {members?.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {getMemberName(member)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs text-slate-500 h-8 border-2"
              onClick={handleClearBrandCaptain}
              disabled={!currentBrandCaptain || savingBrandCaptain}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t my-4" />

        {/* Module Manager */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserCog className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
              Module Manager
            </span>
            {currentModuleManager && (
              <Badge variant="secondary" className="text-[9px] ml-auto">
                {currentModuleManager.userName}
              </Badge>
            )}
          </div>
          <p className="text-[9px] text-slate-400 mb-2">
            Secondary management role
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={currentModuleManager?.userId || ''}
              onValueChange={handleModuleManagerChange}
              disabled={membersLoading || savingModuleManager}
            >
              <SelectTrigger className="rounded-xl border-2 h-10 flex-1">
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                {members?.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {getMemberName(member)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs text-slate-500 h-8 border-2"
              onClick={handleClearModuleManager}
              disabled={!currentModuleManager || savingModuleManager}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
