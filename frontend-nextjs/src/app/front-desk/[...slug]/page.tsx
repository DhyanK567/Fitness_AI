import { redirect } from 'next/navigation';

export default async function FrontDeskSlugPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const path = slug?.[0];
  if (path === 'members') redirect('/staff/members');
  if (path === 'classes' || path === 'schedule') redirect('/staff/classes');
  if (path === 'bookings') redirect('/staff/bookings');
  if (path === 'attendance') redirect('/staff/class-attendance');
  if (path === 'settings' || path === 'profile') redirect('/staff/settings');
  redirect('/staff/dashboard');
}
