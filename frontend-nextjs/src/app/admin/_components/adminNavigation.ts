import type { ComponentType } from 'react';

import {
  ActivityIcon,
  CalendarIcon,
  CheckCircleIcon,
  CreditCardIcon,
  GridIcon,
  HeartPulseIcon,
  LayersIcon,
  ShieldIcon,
  SlidersIcon,
  SparklesIcon,
  TrendingUpIcon,
  UserPlusIcon,
  UsersIcon,
} from '@/components/ui/icons';
import type { IconProps } from '@/components/ui/icons';

export type AdminNavigationItem = { label: string; href: string; icon: ComponentType<IconProps> };
export type AdminNavigationGroup = { label: string; icon: ComponentType<IconProps>; items: AdminNavigationItem[] };

export const adminPrimaryNavigation: AdminNavigationItem = {
  label: 'Dashboard',
  href: '/admin/dashboard',
  icon: GridIcon,
};

export const adminAssistantNavigation: AdminNavigationItem = {
  label: 'Studio AI Assistant',
  href: '/admin/ai-assistant',
  icon: SparklesIcon,
};

export const adminNavigation: AdminNavigationGroup[] = [
  {
    label: 'Members & Memberships',
    icon: UsersIcon,
    items: [
      { label: 'CRM / Leads', href: '/admin/leads', icon: UserPlusIcon },
      { label: 'Members', href: '/admin/members', icon: UsersIcon },
      { label: 'Memberships', href: '/admin/memberships', icon: HeartPulseIcon },
    ],
  },
  {
    label: 'Classes & Bookings',
    icon: CalendarIcon,
    items: [
      { label: 'Classes & Schedule', href: '/admin/classes', icon: CalendarIcon },
      { label: 'Bookings', href: '/admin/bookings', icon: LayersIcon },
      { label: 'Attendance', href: '/admin/attendance', icon: CheckCircleIcon },
    ],
  },
  {
    label: 'Team & Performance',
    icon: ShieldIcon,
    items: [
      { label: 'Trainers', href: '/admin/trainers', icon: HeartPulseIcon },
      { label: 'Member Feedback & Reviews', href: '/admin/feedback', icon: ActivityIcon },
      { label: 'Staff', href: '/admin/staff', icon: ShieldIcon },
    ],
  },
  {
    label: 'Finance & Reports',
    icon: CreditCardIcon,
    items: [
      { label: 'Payments', href: '/admin/payments', icon: CreditCardIcon },
      { label: 'Reports', href: '/admin/reports', icon: TrendingUpIcon },
    ],
  },
  {
    label: 'Events',
    icon: CalendarIcon,
    items: [{ label: 'Events', href: '/admin/events', icon: CalendarIcon }],
  },
  {
    label: 'Data & Platform Tools',
    icon: LayersIcon,
    items: [
      { label: 'Import / Export', href: '/admin/import-export', icon: CreditCardIcon },
      { label: 'Knowledge Base', href: '/admin/knowledge-base', icon: LayersIcon },
      { label: 'Platform Tour', href: '/admin/platform-tour', icon: GridIcon },
    ],
  },
  {
    label: 'Studio Settings',
    icon: SlidersIcon,
    items: [{ label: 'Settings', href: '/admin/settings', icon: SlidersIcon }],
  },
];

export function adminPageTitle(pathname: string): string {
  if (pathname === '/admin/dashboard' || pathname === '/admin') return adminPrimaryNavigation.label;
  if (pathname === '/admin/ai-assistant') return 'Studio AI Assistant';
  for (const group of adminNavigation) {
    const item = group.items.find((candidate) => candidate.href === pathname);
    if (item) return item.label;
  }
  return 'Admin workspace';
}
