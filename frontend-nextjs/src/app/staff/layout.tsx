import type { Metadata } from 'next';
import { StaffWorkspaceShell } from './_components/StaffWorkspaceShell';

export const metadata: Metadata = {
  title: {
    default: 'Staff Workspace - Fitness AI',
    template: '%s - Staff - Fitness AI',
  },
  description: 'Operations, reception, attendance, reservations, leads, and desk payments.',
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <StaffWorkspaceShell>{children}</StaffWorkspaceShell>;
}
