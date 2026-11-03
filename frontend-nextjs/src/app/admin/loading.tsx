import { SparklesIcon } from '@/components/ui/icons';

export default function AdminLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-[42vh] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-6 text-center text-[var(--staff-text)] shadow-subtle dark:border-slate-800 dark:bg-slate-900/70"
    >
      <span className="relative mb-7 flex h-20 w-20 items-center justify-center rounded-[1.65rem] border border-rose-100 bg-white text-rose-600 shadow-[0_12px_40px_rgba(225,29,72,0.10)] dark:border-slate-700 dark:bg-slate-900 dark:text-rose-300">
        <span className="absolute inset-0 animate-ping rounded-[1.65rem] border border-rose-300/50 dark:border-rose-400/20" aria-hidden="true" />
        <SparklesIcon size="md" />
      </span>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">Fitness Studio OS</p>
      <h1 className="mt-3 font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
        Opening module…
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
        Your workspace data stays loaded while this screen is prepared.
      </p>
      <span className="mt-7 h-1 w-20 overflow-hidden rounded-full bg-rose-100 dark:bg-slate-800" aria-hidden="true">
        <span className="block h-full w-1/2 animate-pulse rounded-full bg-rose-500" />
      </span>
    </main>
  );
}
