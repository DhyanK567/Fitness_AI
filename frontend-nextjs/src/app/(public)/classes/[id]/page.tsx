import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import { publicSessions } from '../sessions';

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = publicSessions.find((item) => item.id === id);

  if (!session) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] font-sans text-slate-800">
      <PublicNavbar activeSection="classes" />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <Link href="/classes" className="inline-flex min-h-10 items-center rounded-lg text-sm font-semibold text-slate-600 transition-colors hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">← <span className="ml-2">All sessions</span></Link>
        <section className="mt-6 grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div className="relative min-h-[320px] overflow-hidden rounded-[1.75rem] bg-slate-200 sm:min-h-[460px]">
            <Image src={session.image} alt={session.alt} fill unoptimized priority sizes="(max-width: 1023px) 100vw, 55vw" className="object-cover" />
            <span className="absolute bottom-5 left-5 rounded-full border border-white/40 bg-slate-950/35 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-sm">{session.discipline}</span>
          </div>
          <div className="py-2 lg:py-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">Session notes</p>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">{session.name}</h1>
            <p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">{session.description}</p>
            <dl className="mt-8 grid grid-cols-2 gap-x-5 gap-y-6 border-y border-slate-200 py-6 text-sm">
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Duration</dt><dd className="mt-1.5 font-medium text-slate-900">{session.duration}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Intensity</dt><dd className="mt-1.5 font-medium text-slate-900">{session.intensity}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Studio</dt><dd className="mt-1.5 font-medium text-slate-900">{session.studio}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Instructor</dt><dd className="mt-1.5 font-medium text-slate-900">{session.instructor}</dd></div>
            </dl>
            <p className="mt-7 text-xs leading-6 text-slate-500">Class access and availability are shown in the member experience for your studio.</p>
            <Link href="/member-login" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-rose-800 px-6 text-sm font-semibold text-white transition-colors hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2">Member sign in</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
