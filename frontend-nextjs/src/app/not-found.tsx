import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center text-center p-4 bg-slate-950 text-slate-100">
      <h2 className="text-4xl font-extrabold text-emerald-400">404</h2>
      <p className="text-xl font-semibold mt-2">Page Not Found</p>
      <p className="text-slate-400 mt-2 max-w-sm">The page or module you are looking for has not been created yet or does not exist.</p>
      <Link
        href="/"
        className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-emerald-400 font-medium transition"
      >
        Return to Overview
      </Link>
    </div>
  );
}
