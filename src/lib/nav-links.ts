import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Settings, Shield, DatabaseZap, Database, Building2 } from 'lucide-react';

export type SubNavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavLink = {
  href?: string;
  label: string;
  icon: LucideIcon;
  subLinks?: SubNavLink[];
};

export const navLinks: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    label: 'Admin',
    icon: Shield,
    subLinks: [
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/data-connect', label: 'Data Connect', icon: DatabaseZap },
      { href: '/data-management', label: 'Data Management', icon: Database },
      { href: '/organisations', label: 'Organisations', icon: Building2 },
    ],
  },
];
