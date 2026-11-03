import { redirect } from 'next/navigation';

export default async function BillingSlugPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  redirect('/staff/dashboard');
}
