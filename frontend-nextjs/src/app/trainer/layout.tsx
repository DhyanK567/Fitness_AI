import type { Metadata } from 'next';
import { TrainerWorkspaceShell } from './_components/TrainerWorkspaceShell';

export const metadata: Metadata = {
  title: {
    default: 'Trainer Workspace - Fitness AI',
    template: '%s - Trainer - Fitness AI',
  },
  description: 'Assigned clients, sessions, attendance, programs, and progress for gym, yoga, dance, and group-fitness professionals.',
};

export default function TrainerLayout({ children }: { children: React.ReactNode }) {
  return <TrainerWorkspaceShell>{children}</TrainerWorkspaceShell>;
}
