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
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { navLinks } from "@/lib/nav-links";
import { Logo } from "@/components/logo";
import { ChevronRight } from "lucide-react";
import React, { useEffect } from "react";

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);


  const checkActive = (href: string) => pathname.startsWith(href);
  const checkSubLinksActive = (subLinks: typeof navLinks[0]['subLinks']) =>
    subLinks && subLinks.some((sub) => pathname.startsWith(sub.href));


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Logo />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navLinks.map((link) =>
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
      </SidebarContent>
    </Sidebar>
  );
}
