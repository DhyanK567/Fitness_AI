import { redirect } from 'next/navigation';

export default async function LeadTrainerSlugPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const path = slug?.[0];
  if (path === 'members') redirect('/trainer/members');
  if (path === 'classes') redirect('/trainer/classes');
  if (path === 'attendance') redirect('/trainer/attendance');
  if (path === 'settings') redirect('/trainer/settings');
  redirect('/trainer/dashboard');
}
