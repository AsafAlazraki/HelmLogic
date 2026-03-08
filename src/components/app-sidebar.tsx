
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
  SidebarMenuSkeleton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { navLinks } from "@/lib/nav-links";
import { Logo } from "@/components/logo";
import { ChevronRight, Bell, User, LogOut, ShieldCheck, Cog, Check } from "lucide-react";
import React, { useEffect, useMemo } from "react";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc, setDoc, collection } from "firebase/firestore";
import { useCollection } from "@/firebase/firestore/use-collection";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export function AppSidebar() {
  const pathname = usePathname();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const { user, loading: userLoading } = useUser();
  
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile, loading: profileLoading } = useDoc<{ appRole?: string; organisationId?: string; organisationRole?: string }>(userProfileRef);
  
  const organisationsQuery = useMemoFirebase(() => collection(firestore, 'organisations'), [firestore]);
  const { data: organisations, loading: orgsLoading } = useCollection<any>(organisationsQuery);

  const organisation = useMemo(() => 
    userProfile?.organisationId ? organisations?.find((o: any) => o.id === userProfile.organisationId) : null,
  [userProfile, organisations]);

  const isLoading = userLoading || profileLoading || orgsLoading;

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  const handleRoleChange = async (value: string) => {
    if (!user) return;
    const userRef = doc(firestore, "users", user.uid);

    try {
        if (value === 'admin') {
            await setDoc(userRef, {
                appRole: 'HelmLogic Admin',
                organisationId: null,
                organisationRole: null,
            }, { merge: true });
            toast({ title: "Role updated", description: "Switched to HelmLogic Admin." });
        } else if (value === 'employee') {
            const northsideMarine = organisations?.find((o: any) => o.name === 'Northside Marine');
            if (northsideMarine?.roles?.length > 0) {
                const mdRole = northsideMarine.roles.find((r: any) => r.name === 'Managing Director') || northsideMarine.roles[0];
                await setDoc(userRef, {
                    appRole: 'General User',
                    organisationId: northsideMarine.id,
                    organisationRole: mdRole.id,
                }, { merge: true });
                toast({ title: "Role updated", description: `Switched to ${northsideMarine.name} ${mdRole.name}.` });
            }
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Role switch failed" });
    }
  };

  const northsideMarineOrg = organisations?.find((o: any) => o.name === 'Northside Marine');
  const currentRole = userProfile?.appRole === 'HelmLogic Admin' ? 'admin' : (userProfile?.organisationId ? 'employee' : '');

  const checkActive = (href: string) => pathname.startsWith(href);
  const checkSubLinksActive = (subLinks: typeof navLinks[0]['subLinks']) =>
    subLinks && subLinks.some((sub) => pathname.startsWith(sub.href));

  const filteredNavLinks = useMemo(() => {
    if (isLoading) return [];
    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';
    const isOrgMember = !!userProfile?.organisationId;
    const roleId = userProfile?.organisationRole;
    const userPermissions = roleId && organisation?.permissions?.[roleId] ? organisation.permissions[roleId] : {};
    
    return navLinks.filter(link => {
      if (link.label === 'Admin') return isAdmin;
      if (link.label === 'Dashboard' && isAdmin) return false;
      if (link.label === 'Pricing Manager') {
        if (isAdmin || !isOrgMember) return false;
        const isMD = organisation?.roles?.find((r: any) => r.id === roleId)?.name === 'Managing Director';
        return !!userPermissions.can_access_pricing_manager || isMD;
      }
      if (link.label === 'Settings') return isOrgMember && !!userPermissions.can_access_settings;
      return true;
    });
  }, [userProfile, isLoading, organisation]);

  return (
    <Sidebar collapsible="icon" className="border-r-0 shadow-2xl">
      <SidebarHeader className="h-16 flex items-center justify-between px-4 border-b bg-card">
        <div className="flex items-center gap-2 overflow-hidden">
            <Logo />
        </div>
        <SidebarTrigger className="shrink-0 text-primary border-2 border-primary/10 bg-primary/5 shadow-inner" />
      </SidebarHeader>
      
      <SidebarContent className="bg-card">
        {isLoading ? (
          <SidebarMenu className="mt-2">
            {[1, 2, 3].map(i => (
              <SidebarMenuItem key={i}><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
            ))}
          </SidebarMenu>
        ) : (
          <SidebarMenu className="gap-2 mt-4">
            {filteredNavLinks.map((link) => (
              <SidebarMenuItem key={link.label}>
                {link.subLinks ? (
                  <Collapsible defaultOpen={checkSubLinksActive(link.subLinks)}>
                    <div className="relative">
                      <SidebarMenuButton
                        asChild
                        isActive={checkActive(link.href || '') || checkSubLinksActive(link.subLinks)}
                        tooltip={link.label}
                        className="pr-12"
                      >
                        <Link href={link.href || '#'}>
                          <link.icon className="size-6" />
                          <span className="group-data-[collapsible=icon]:hidden">{link.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      <CollapsibleTrigger asChild>
                        <button className="absolute right-0 top-0 flex h-full items-center justify-center p-3 group-data-[collapsible=icon]:hidden">
                            <ChevronRight className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                        </button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <SidebarMenuSub className="border-primary/10">
                        {link.subLinks.map((sub) => (
                          <SidebarMenuSubItem key={sub.href}>
                            <SidebarMenuSubButton asChild isActive={checkActive(sub.href)} className="data-[active=true]:bg-primary/5 data-[active=true]:text-primary">
                              <Link href={sub.href} className="flex items-center gap-2">
                                <sub.icon className="size-4" />
                                <span>{sub.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <SidebarMenuButton asChild isActive={checkActive(link.href || '')} tooltip={link.label}>
                    <Link href={link.href || '#'}>
                      <link.icon className="size-6" />
                      <span className="group-data-[collapsible=icon]:hidden">{link.label}</span>
                    </Link>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t bg-muted/5 group-data-[collapsible=icon]:p-2">
        <SidebarGroup className="p-0 space-y-4">
          <div className="flex items-center justify-between group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-4">
            <NotificationBell />
            <UserMenu />
          </div>
          
          <div className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className="px-0 h-6 font-black uppercase text-[9px] tracking-widest text-muted-foreground/60">Session Context</SidebarGroupLabel>
            {isLoading ? (
              <Skeleton className="h-9 w-full rounded-lg" />
            ) : (
              <Select onValueChange={handleRoleChange} value={currentRole}>
                <SelectTrigger className="h-9 bg-background border-2 font-bold text-[10px] uppercase shadow-sm">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin" className="text-[10px] font-bold uppercase">System Admin</SelectItem>
                  <SelectItem value="employee" disabled={!northsideMarineOrg} className="text-[10px] font-bold uppercase">Marine Employee</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
