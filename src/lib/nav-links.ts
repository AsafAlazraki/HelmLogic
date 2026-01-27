import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Route, Map, FileText, Ship } from 'lucide-react';

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navLinks: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/route-optimization', label: 'Route Optimization', icon: Route },
  { href: '/real-time-tracking', label: 'Real-Time Tracking', icon: Map },
  { href: '/reporting', label: 'Reporting', icon: FileText },
  { href: '/highfield', label: 'Highfield', icon: Ship },
];
