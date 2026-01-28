'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Fragment } from 'react';
import { navLinks } from '@/lib/nav-links';

type BreadcrumbPart = {
  href: string;
  label: string;
};

// A simple helper to convert a slug to a title.
// e.g. "route-optimization" -> "Route Optimization"
const segmentToTitle = (segment: string) => {
    // A simple guard against displaying long IDs.
    if (segment.length > 20) {
        return "Details";
    }
    return segment.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const findPathParts = (pathname: string): BreadcrumbPart[] => {
    const parts: BreadcrumbPart[] = [];
    
    // Exact match for top-level links without children
    const exactMatch = navLinks.find(l => l.href === pathname && !l.subLinks);
    if (exactMatch) {
        return [{ href: exactMatch.href, label: exactMatch.label }];
    }

    for (const navLink of navLinks) {
        // Check sublinks for a match
        if (navLink.subLinks) {
            for (const subLink of navLink.subLinks) {
                if (pathname.startsWith(subLink.href)) {
                    // Add parent link (e.g., Admin)
                    if (navLink.href) {
                      parts.push({ href: navLink.href, label: navLink.label });
                    }
                    
                    // Add the matched sublink (e.g., Organisations)
                    parts.push({ href: subLink.href, label: subLink.label });
                    
                    // Handle additional segments (e.g., /add in /organisations/add)
                    const remainingPath = pathname.substring(subLink.href.length);
                    if (remainingPath) {
                        const segments = remainingPath.split('/').filter(Boolean);
                        segments.forEach((segment, index) => {
                            const currentSubPath = segments.slice(0, index + 1).join('/');
                            parts.push({
                                href: `${subLink.href}/${currentSubPath}`,
                                label: segmentToTitle(segment),
                            });
                        });
                    }
                    return parts;
                }
            }
        }
    }
    
    // Check for a match on a parent link that is also a page itself (e.g. /admin)
    const parentPageMatch = navLinks.find(l => l.href === pathname);
    if(parentPageMatch) {
        return [{ href: parentPageMatch.href, label: parentPageMatch.label }];
    }


    // Generic fallback based on URL segments if no match is found in navLinks
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join('/')}`;
        return { href, label: segmentToTitle(segment) };
    });
};

export function BreadcrumbNav({ pageTitle }: { pageTitle?: string }) {
  const pathname = usePathname();

  if (pathname === '/dashboard') {
    return (
        <Breadcrumb className="hidden md:flex mt-2 mb-6">
            <BreadcrumbList>
                <BreadcrumbItem>
                    <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
            </BreadcrumbList>
        </Breadcrumb>
    );
  }

  const pathParts = findPathParts(pathname);

  // Always start with Dashboard
  const breadcrumbs = [{ href: '/dashboard', label: 'Dashboard' }, ...pathParts];
  if (pageTitle && breadcrumbs.length > 1) {
    breadcrumbs[breadcrumbs.length - 1].label = pageTitle;
  }

  return (
    <Breadcrumb className="hidden md:flex mt-2 mb-6">
      <BreadcrumbList>
        {breadcrumbs.map((part, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
                <Fragment key={part.href}>
                    {index > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                    {isLast ? (
                        <BreadcrumbPage>{part.label}</BreadcrumbPage>
                    ) : (
                        <BreadcrumbLink asChild>
                            <Link href={part.href}>{part.label}</Link>
                        </BreadcrumbLink>
                    )}
                    </BreadcrumbItem>
                </Fragment>
            )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
