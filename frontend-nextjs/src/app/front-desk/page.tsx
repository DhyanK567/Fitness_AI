import { redirect } from 'next/navigation';

export default function FrontDeskIndexPage() {
  redirect('/staff/dashboard');
}
