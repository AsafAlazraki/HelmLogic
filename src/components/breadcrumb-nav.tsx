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

export type BreadcrumbPart = {
  href: string;
  label: string;
};

const segmentToTitle = (segment: string) => {
    // A simple guard against displaying long IDs.
    if (segment.length >= 20) {
        return "Details";
    }
    return segment.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const generatePartsFromPath = (pathname: string): BreadcrumbPart[] => {
    const segments = pathname.split('/').filter(Boolean);
    let cumulativePath = '';
    const parts = segments.map(segment => {
        cumulativePath += `/${segment}`;
        // Try to find a label from navLinks first
        for (const navLink of navLinks) {
            if (navLink.href === cumulativePath) return { href: cumulativePath, label: navLink.label };
            if (navLink.subLinks) {
                const subLink = navLink.subLinks.find(sl => sl.href === cumulativePath);
                if (subLink) return { href: cumulativePath, label: subLink.label };
            }
        }
        return { href: cumulativePath, label: segmentToTitle(segment) };
    });

    // Add dashboard as root if not an admin page
    if (!pathname.startsWith('/admin') && (parts.length === 0 || parts[0].label.toLowerCase() !== 'dashboard')) {
        parts.unshift({ href: '/dashboard', label: 'Dashboard'});
    } else if (pathname.startsWith('/admin') && (parts.length === 0 || parts[0].label.toLowerCase() !== 'admin')) {
         parts.unshift({ href: '/admin', label: 'Admin'});
    }
    
    return parts;
};


export function BreadcrumbNav({ parts }: { parts?: BreadcrumbPart[] }) {
  const pathname = usePathname();
  
  const breadcrumbParts = parts && parts.length > 0 ? parts : generatePartsFromPath(pathname);

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

  return (
    <Breadcrumb className="hidden md:flex mt-2 mb-6">
      <BreadcrumbList>
        {breadcrumbParts.map((part, index) => {
            const isLast = index === breadcrumbParts.length - 1;
            return (
                <Fragment key={`${part.href}-${index}`}>
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
