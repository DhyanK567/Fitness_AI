'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BUILT_IN_DEMO_ACCOUNTS, getDemoAccounts, studioRoleLabel, type DemoAccount } from '@/lib/auth/demoAuth';
import { indianMobileNationalNumber, isValidIndianMobile } from '@/lib/localization/india';

export default function ResetPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [matchedAccount, setMatchedAccount] = useState<DemoAccount | null>(null);
  const [checkedIdentifier, setCheckedIdentifier] = useState('');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMatchedAccount(null);
    setCheckedIdentifier('');

    const trimmed = identifier.trim();
    const digits = indianMobileNationalNumber(trimmed);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.toLowerCase());
    const isPhone = isValidIndianMobile(trimmed);

    if (!trimmed) {
      setError('Enter the work email or 10-digit phone number associated with your studio account.');
      return;
    }
    if (!isEmail && !isPhone) {
      setError('Enter a valid email address (for example, admin@fitnessstudio.demo) or a 10-digit phone number.');
      return;
    }

    const accounts = getDemoAccounts();
    const match = accounts.find(
      (candidate) =>
        candidate.email.trim().toLowerCase() === trimmed.toLowerCase() ||
        (isPhone && indianMobileNationalNumber(candidate.phone) === digits)
    );

    setCheckedIdentifier(trimmed);
    setMatchedAccount(match ?? null);
  }

  return (
    <main className="min-h-screen bg-[#FCFAF8] px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1fr_440px]">
        <section className="mx-auto max-w-xl">
          <Link href="/staff-login" className="text-sm font-bold text-slate-900 hover:text-rose-700">
            ← Back to Studio Login
          </Link>
          <p className="mt-10 text-xs font-bold uppercase tracking-[.2em] text-rose-700">Frontend Demo Preview</p>
          <h1 className="mt-3 font-serif text-4xl font-bold leading-tight sm:text-5xl">
            Account recovery &amp; demo credential lookup.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
            This build runs entirely in browser demo mode without an email server or backend password-reset endpoint.
            You can verify whether an email or phone number exists in the local studio roster below.
          </p>
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs leading-5 text-amber-950">
            <strong className="font-semibold">Honest preview notice:</strong> Submitting this form does not send an
            email, dispatch an SMS, or change any stored password. Built-in demo credentials remain unchanged.
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-rose-700">Password Recovery Preview</p>
          <h2 className="mt-2 font-serif text-2xl font-bold">Check studio account</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Enter your studio email or phone number to check its local demo status.
          </p>

          <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-xs font-semibold text-slate-700">
              Studio email or phone
              <input
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setError('');
                }}
                placeholder="admin@fitnessstudio.demo or 9000000001"
                className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-800">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="h-12 w-full rounded-full bg-[#E11D48] text-sm font-bold text-white shadow-sm transition hover:bg-[#BE123C]"
            >
              Verify demo account
            </button>
          </form>

          {checkedIdentifier && (
            <div
              role="status"
              className={`mt-5 rounded-2xl border p-4 text-xs leading-5 ${
                matchedAccount
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              {matchedAccount ? (
                <>
                  <p className="font-bold text-emerald-900">
                    Local demo account found · {studioRoleLabel(matchedAccount.role)}
                  </p>
                  <p className="mt-1">
                    <strong>{matchedAccount.name}</strong> ({matchedAccount.email}) is available in this browser
                    workspace. No reset email was sent because email delivery is not connected.
                  </p>
                  <p className="mt-2 rounded-xl bg-white/90 px-3 py-2 font-mono text-[11px] text-slate-800">
                    Demo password: <strong>{matchedAccount.password}</strong>
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-slate-900">No matching local demo account</p>
                  <p className="mt-1">
                    “{checkedIdentifier}” does not match any studio account in this browser. No email or SMS was sent.
                    Use one of the built-in demo accounts below to sign in.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50 p-3.5 text-xs">
            <p className="font-semibold text-slate-800">Built-in studio demo credentials</p>
            <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600">
              {BUILT_IN_DEMO_ACCOUNTS.map((account) => (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5">
                  <span className="font-semibold text-slate-800">{studioRoleLabel(account.role)}</span>
                  <span className="font-mono text-slate-600">
                    {account.email} / <strong>{account.password}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 text-xs text-slate-500">
            <Link href="/staff-login" className="font-bold text-rose-700 hover:underline">
              Return to Studio Login
            </Link>
            <Link href="/member-login" className="font-semibold text-slate-600 hover:text-rose-700 hover:underline">
              Member OTP Login →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
