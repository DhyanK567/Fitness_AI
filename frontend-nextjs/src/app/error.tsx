'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h2 className="text-2xl font-bold text-rose-500">Something went wrong</h2>
      <p className="text-sm text-slate-400 mt-2 max-w-md">{error.message || 'An unexpected error occurred.'}</p>
      <button
        onClick={() => reset()}
        className="mt-6 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm font-semibold transition"
      >
        Try again
      </button>
    </div>
  );
}
