'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MemberIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/member/home');
  }, [router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Entering Member Sanctuary...
        </p>
      </div>
    </div>
  );
}
