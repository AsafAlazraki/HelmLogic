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
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { navLinks } from "@/lib/nav-links";
import { Logo } from "@/components/logo";
import { ChevronRight } from "lucide-react";
import React, { useState, useEffect } from "react";

export function AppSidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const checkActive = (href: string) => mounted && pathname.startsWith(href);
  const checkSubLinksActive = (subLinks: typeof link.subLinks) =>
    mounted && subLinks && subLinks.some((sub) => pathname.startsWith(sub.href));


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
                  <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        className="w-full justify-between group"
                        isActive={checkSubLinksActive(link.subLinks)}
                        tooltip={{ children: link.label }}
                      >
                        <div className="flex items-center gap-2">
                          <link.icon />
                          <span className="group-data-[collapsible=icon]:hidden">{link.label}</span>
                        </div>
                        <ChevronRight className="size-6 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90 group-data-[collapsible=icon]:hidden" />
                      </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {link.subLinks.map((subLink) => (
                        <SidebarMenuSubItem key={subLink.href}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={checkActive(subLink.href)}
                          >
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
                  <SidebarMenuButton
                    asChild
                    isActive={checkActive(link.href)}
                    tooltip={{ children: link.label }}
                  >
                    <Link href={link.href}>
                      <link.icon />
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
