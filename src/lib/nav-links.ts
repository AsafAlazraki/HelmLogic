import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Settings } from 'lucide-react';

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navLinks: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/settings', label: 'Settings', icon: Settings },
];
