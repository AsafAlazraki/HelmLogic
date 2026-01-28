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

// A simple helper to convert a slug to a title.
// e.g. "route-optimization" -> "Route Optimization"
const segmentToTitle = (segment: string) => {
    return segment.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function BreadcrumbNav() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;
  
  const isDashboard = segments.length === 1 && segments[0] === 'dashboard';

  return (
    <Breadcrumb className="hidden md:flex mt-2">
      <BreadcrumbList>
        <BreadcrumbItem>
          {isDashboard ? (
             <BreadcrumbPage>Dashboard</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {!isDashboard && segments.map((segment, index) => {
            const href = `/${segments.slice(0, index + 1).join('/')}`;
            const isLast = index === segments.length - 1;
            const title = segmentToTitle(segment);

            return (
                <Fragment key={href}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                    {isLast ? (
                        <BreadcrumbPage>{title}</BreadcrumbPage>
                    ) : (
                        <BreadcrumbLink asChild>
                            <Link href={href}>{title}</Link>
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
