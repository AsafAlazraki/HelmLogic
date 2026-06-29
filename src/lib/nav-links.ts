import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Shield, Warehouse, Building2, Settings, Blocks, Coins, Bot, Lightbulb, Users, FileSignature, BarChart3, Briefcase } from 'lucide-react';

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
  // v1.22 (Story 8.1.1) — Sales workspace shell. Groups the v1.21
  // customer surfaces + the v1.22 contracts view under one nav entry.
  {
    href: '/customers',
    label: 'Sales',
    icon: Briefcase,
    subLinks: [
      { href: '/customers', label: 'Customers', icon: Users },
      { href: '/contracts', label: 'Contracts', icon: FileSignature },
      { href: '/reporting', label: 'Reporting', icon: BarChart3 },
    ],
  },
  { href: '/pricing-manager', label: 'Catalog Manager', icon: Coins },
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
