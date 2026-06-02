import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Shield, Warehouse, Building2, Settings, Blocks, Coins, Bot, Lightbulb, Ship, Database } from 'lucide-react';

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
  { href: '/boats', label: 'Boats', icon: Ship },
  { href: '/catalog-manager', label: 'Catalog Manager', icon: Database },
  { href: '/pricing-manager', label: 'Pricing Manager', icon: Coins },
  { href: '/feature-tracking', label: 'Feature Tracking', icon: Lightbulb },
  { href: '/manage', label: 'Settings', icon: Settings },
  {
    href: '/admin',
    label: 'Admin',
    icon: Shield,
    subLinks: [
      { href: '/data-warehouse', label: 'Data Warehouse', icon: Warehouse },
      { href: '/organisations', label: 'Organisations', icon: Building2 },
      { href: '/modules', label: 'Modules', icon: Blocks },
      { href: '/admin/agent-team', label: 'Agent Team', icon: Bot },
    ],
  },
];
