import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { AdminAccessBoundary } from './_components/AdminAccessBoundary';
import type { AdminTheme } from './_components/AdminThemeProvider';

export const metadata: Metadata = {
  title: {
    default: 'Fitness AI — Admin Workspace',
    template: '%s · Admin · Fitness AI',
  },
  description: 'Studio Owner & Admin control center with Fitness AI.',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get('fitness-staff-theme')?.value;
  const initialTheme: AdminTheme = savedTheme === 'dark' ? 'dark' : 'light';

  return <AdminAccessBoundary initialTheme={initialTheme}>{children}</AdminAccessBoundary>;
}
