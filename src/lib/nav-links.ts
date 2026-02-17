
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Shield, Warehouse, Building2, Users, Blocks, Wrench } from 'lucide-react';

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
  { href: '/manage', label: 'Manage', icon: Building2 },
  { href: '/sub-dealers', label: 'Sub Dealers', icon: Users },
  {
    href: '/admin',
    label: 'Admin',
    icon: Shield,
    subLinks: [
      { href: '/data-warehouse', label: 'Data Warehouse', icon: Warehouse },
      { href: '/organisations', label: 'Organisations', icon: Building2 },
      { href: '/modules', label: 'Modules', icon: Blocks },
    ],
  },
];
