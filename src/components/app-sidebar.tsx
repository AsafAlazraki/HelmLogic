
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { navLinks } from "@/lib/nav-links";
import { Logo } from "@/components/logo";
import { ChevronRight } from "lucide-react";
import React, { useEffect, useMemo } from "react";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc } from "firebase/firestore";

export function AppSidebar() {
  const pathname = usePathname();
  const firestore = useFirestore();
  const { isMobile, setOpenMobile } = useSidebar();
  const { user, loading: userLoading } = useUser();
  
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile, loading: profileLoading } = useDoc<{ appRole?: string; organisationId?: string; organisationRole?: string }>(userProfileRef);
  
  const orgRef = useMemoFirebase(() => userProfile?.organisationId ? doc(firestore, 'organisations', userProfile.organisationId) : null, [firestore, userProfile]);
  const { data: organisation, loading: orgLoading } = useDoc<{ parentOrganisationId?: string; enabledModuleSubscriptions?: string[]; permissions?: Record<string, Record<string, boolean>> }>(orgRef);

  const isLoading = userLoading || profileLoading || orgLoading;

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);


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
      if (link.label === 'Admin') {
        return isAdmin;
      }
      if (link.label === 'Dashboard' && isAdmin) {
        return false; // Hide Dashboard for admins
      }
      if (link.label === 'Pricing Manager') {
        if (isAdmin) return true;
        if (!isOrgMember) return false;
        
        const hasPermission = !!userPermissions.can_access_pricing_manager;
        if (!hasPermission) return false;

        // If it's a sub-dealer, check if parent allowed it (system-pricing module ID)
        if (organisation?.parentOrganisationId) {
            return organisation.enabledModuleSubscriptions?.includes('system-pricing') ?? false;
        }
        
        return true; // Default available for top-level orgs if permission exists
      }
      if (link.label === 'Settings') {
        if (isAdmin) return false;
        if (!isOrgMember) return false;
        return !!userPermissions.can_access_settings;
      }
      return true;
    });
  }, [userProfile, isLoading, organisation]);


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 flex items-center justify-center pt-4">
        <Logo />
      </SidebarHeader>
      <SidebarContent>
        {isLoading ? (
          <SidebarMenu className="mt-2">
            <SidebarMenuItem>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          <SidebarMenu className="gap-2 mt-2">
            {filteredNavLinks.map((link) =>
              link.subLinks ? (
                <SidebarMenuItem key={link.label}>
                  <Collapsible defaultOpen={checkSubLinksActive(link.subLinks)}>
                    {link.href ? (
                      <div className="relative">
                        <SidebarMenuButton
                          asChild
                          isActive={checkActive(link.href) || checkSubLinksActive(link.subLinks)}
                          tooltip={{ children: link.label }}
                          className="pr-12"
                        >
                          <Link href={link.href}>
                            <link.icon className="size-6" />
                            <span className="group-data-[collapsible=icon]:hidden">{link.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        <CollapsibleTrigger asChild>
                          <button className="absolute right-0 top-0 flex h-full items-center justify-center p-3 group-data-[collapsible=icon]:hidden">
                              <ChevronRight className="size-6 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                          </button>
                        </CollapsibleTrigger>
                      </div>
                    ) : (
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          className="w-full justify-between group"
                          isActive={checkSubLinksActive(link.subLinks)}
                          tooltip={{ children: link.label }}
                        >
                          <div className="flex items-center gap-2">
                            <link.icon className="size-6" />
                            <span className="group-data-[collapsible=icon]:hidden">{link.label}</span>
                          </div>
                          <ChevronRight className="size-6 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90 group-data-[collapsible=icon]:hidden" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                    )}
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {link.subLinks.map((subLink) => (
                          <SidebarMenuSubItem key={subLink.href}>
                            <SidebarMenuSubButton asChild isActive={checkActive(subLink.href)}>
                              <Link href={subLink.href}>
                                <subLink.icon />
                                <span>{subLink.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              ) : (
                link.href && (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={checkActive(link.href)} tooltip={{ children: link.label }}>
                      <Link href={link.href}>
                        <link.icon className="size-6" />
                        <span className="group-data-[collapsible=icon]:hidden">{link.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )
            )}
          </SidebarMenu>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
