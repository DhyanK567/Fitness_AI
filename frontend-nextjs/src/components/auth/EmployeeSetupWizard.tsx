'use client';

import Image from 'next/image';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Download, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { PASSWORD_RULES } from '@/lib/auth/studio-auth';
import {
  completeTeamInvitation,
  createTeamEnrollment,
  invitationRoleLabel,
  resolveTeamInvitation,
  type TeamEnrollment,
  type TeamInvitation,
} from '@/lib/auth/team-invitations';

const inputClass = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';
const errorMessages = {
  malformed: 'This invitation link is malformed. Ask your studio administrator for a new link.',
  not_found: 'This invitation link is not recognized in this browser workspace.',
  expired: 'This invitation has expired. Ask your studio administrator to resend it.',
  completed: 'This invitation has already been completed. Sign in with your work email and password.',
  revoked: 'This invitation was revoked by your studio administrator.',
};

function OtpBoxes({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return <div><label htmlFor="employee-totp" className="text-sm font-semibold text-slate-800">6-digit authenticator code</label><div onClick={() => ref.current?.focus()} className="relative mt-3 grid cursor-text grid-cols-6 gap-2"><input ref={ref} id="employee-totp" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="absolute inset-0 z-10 h-full w-full opacity-0" />{Array.from({ length: 6 }).map((_, index) => <span aria-hidden="true" key={index} className={`flex aspect-square items-center justify-center rounded-xl border bg-white text-xl font-bold ${index === value.length ? 'border-indigo-500 ring-4 ring-indigo-100' : 'border-slate-200'}`}>{value[index] ?? ''}</span>)}</div></div>;
}

export function EmployeeSetupWizard({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<TeamInvitation | null>(null);
  const [fatalError, setFatalError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [enrollment, setEnrollment] = useState<TeamEnrollment | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const score = useMemo(() => PASSWORD_RULES.filter((rule) => rule.test(password)).length, [password]);

  useEffect(() => {
    let active = true;
    resolveTeamInvitation(token).then((result) => {
      if (!active) return;
      if (!result.invitation || result.error) setFatalError(errorMessages[result.error ?? 'not_found']);
      else setInvitation(result.invitation);
      setLoading(false);
    }).catch(() => { if (active) { setFatalError(errorMessages.not_found); setLoading(false); } });
    return () => { active = false; };
  }, [token]);

  async function beginAuthenticator(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!PASSWORD_RULES.every((rule) => rule.test(password))) return setError('Your password must satisfy all five security requirements.');
    if (password !== confirmPassword) return setError('Password confirmation does not match.');
    if (!invitation) return;
    setBusy(true);
    try {
      const next = await createTeamEnrollment(token);
      setEnrollment(next);
      setQrDataUrl(await QRCode.toDataURL(next.otpAuthUrl, { width: 256, margin: 1, errorCorrectionLevel: 'M' }));
      setStep(2);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Authenticator enrollment could not be started.');
    } finally { setBusy(false); }
  }

  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(''), 1600); }
    catch { setError('Clipboard access was blocked. Select and copy the value manually.'); }
  }

  function downloadCodes() {
    if (!enrollment || !invitation) return;
    const blob = new Blob([`${invitation.studioName} recovery codes\n${invitation.email}\n\n${enrollment.recoveryCodes.join('\n')}\n\nEach code can be used once.`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'fitness-studio-recovery-codes.txt'; anchor.click(); URL.revokeObjectURL(url);
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    if (!enrollment || !invitation) return;
    if (code.length !== 6) return setError('Enter the complete 6-digit code from your authenticator app.');
    setBusy(true); setError('');
    try {
      const completed = await completeTeamInvitation({ token, password, totpCode: code });
      window.location.assign(completed.redirectTo);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Setup could not be completed.'); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50"><div role="status" className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Loader2 className="size-5 animate-spin" />Validating invitation…</div></main>;
  if (fatalError || !invitation) return <main className="grid min-h-screen place-items-center bg-slate-50 p-4"><section className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-7 text-center shadow-xl"><ShieldCheck className="mx-auto size-10 text-rose-600" /><h1 className="mt-4 text-2xl font-bold">Invitation unavailable</h1><p role="alert" className="mt-3 text-sm leading-6 text-slate-600">{fatalError}</p><a href="/staff-login?mode=login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white">Go to sign in</a></section></main>;

  return <main className="min-h-screen bg-slate-50/70 px-4 py-8 sm:py-14"><section className="mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-white bg-white shadow-2xl shadow-slate-200/60"><header className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-rose-300">{invitation.studioName}</p><h1 className="mt-2 text-3xl font-bold">Welcome, {invitation.name}</h1><div className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/20">{invitationRoleLabel(invitation.role)}</div><ol className="mt-7 grid grid-cols-3 gap-2" aria-label="Setup progress">{['Password', 'Authenticator', 'Verify'].map((label, index) => <li key={label}><div className={`h-1.5 rounded-full ${index + 1 <= step ? 'bg-rose-500' : 'bg-white/20'}`} /><p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-white/70">{index + 1}. {label}</p></li>)}</ol></header><div className="p-6 sm:p-8">
    {step === 1 && <form onSubmit={beginAuthenticator} className="space-y-5"><div><h2 className="text-xl font-bold text-slate-950">Create your password</h2><p className="mt-1 text-sm text-slate-500">Your password is securely hashed by the studio identity service and works across your approved devices.</p></div><label className="block text-sm font-semibold text-slate-800">Password<div className="relative mt-2"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} pr-12`} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></div></label><div className="grid grid-cols-5 gap-1">{PASSWORD_RULES.map((rule, index) => <span key={rule.label} className={`h-1.5 rounded-full ${index < score ? 'bg-emerald-500' : 'bg-slate-200'}`} />)}</div><ul className="grid gap-2 text-xs sm:grid-cols-2">{PASSWORD_RULES.map((rule) => <li key={rule.label} className={`flex items-center gap-2 ${rule.test(password) ? 'text-emerald-700' : 'text-slate-500'}`}><Check className="size-3.5" />{rule.label}</li>)}</ul><label className="block text-sm font-semibold text-slate-800">Confirm password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={`${inputClass} mt-2`} /></label>{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 px-5 text-sm font-bold text-white disabled:opacity-50">{busy && <Loader2 className="size-4 animate-spin" />}{busy ? 'Preparing authenticator…' : 'Continue to Authenticator'}</button></form>}
    {step === 2 && enrollment && <div className="space-y-5"><div><h2 className="text-xl font-bold text-slate-950">Secure with Google Authenticator</h2><p className="mt-1 text-sm leading-6 text-slate-500">Scan the QR code, then save your single-use recovery codes before continuing.</p></div><div className="grid gap-5 sm:grid-cols-[220px_1fr]"><div className="grid place-items-center rounded-2xl border border-slate-200 bg-white p-3">{qrDataUrl ? <Image src={qrDataUrl} width={200} height={200} alt="Google Authenticator enrollment QR code" unoptimized /> : <Loader2 className="size-7 animate-spin text-indigo-600" />}</div><div><p className="text-xs font-bold text-slate-700">Manual setup key</p><button type="button" onClick={() => copy(enrollment.secret, 'secret')} className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs font-bold tracking-wider"><span className="break-all">{enrollment.secret}</span>{copied === 'secret' ? <Check className="size-4 text-emerald-600" /> : <Clipboard className="size-4" />}</button><p className="mt-3 text-xs leading-5 text-slate-500">Google Authenticator → Add code → Scan QR code or enter setup key.</p></div></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-wide text-amber-900">10 recovery codes</p><div className="flex gap-2"><button type="button" onClick={() => copy(enrollment.recoveryCodes.join('\n'), 'codes')} className="inline-flex items-center gap-1 text-xs font-bold text-amber-900"><Clipboard className="size-3.5" />{copied === 'codes' ? 'Copied' : 'Copy all'}</button><button type="button" onClick={downloadCodes} className="inline-flex items-center gap-1 text-xs font-bold text-amber-900"><Download className="size-3.5" />Download</button></div></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{enrollment.recoveryCodes.map((item) => <code key={item} className="rounded-lg bg-white/80 px-2 py-2 text-center text-[10px] font-bold text-amber-950">{item}</code>)}</div></div><label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-600"><input type="checkbox" checked={recoverySaved} onChange={(event) => setRecoverySaved(event.target.checked)} className="mt-1 size-4 accent-rose-600" /><span>I saved these recovery codes somewhere private. They will not be shown again after setup.</span></label>{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<button type="button" disabled={!recoverySaved} onClick={() => { setError(''); setStep(3); }} className="min-h-12 w-full rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">I saved my codes — verify</button></div>}
    {step === 3 && enrollment && <form onSubmit={finish} className="space-y-6"><div className="text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><KeyRound className="size-7" /></span><h2 className="mt-4 text-xl font-bold text-slate-950">Verify your authenticator</h2><p className="mt-1 text-sm text-slate-500">Enter the current code shown for {invitation.email}.</p></div><OtpBoxes value={code} onChange={(value) => { setCode(value); setError(''); }} disabled={busy} />{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<button type="submit" disabled={busy || code.length !== 6} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 px-5 text-sm font-bold text-white disabled:opacity-45">{busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{busy ? 'Securing account…' : 'Complete setup & sign in'}</button><button type="button" disabled={busy} onClick={() => setStep(2)} className="w-full text-xs font-bold text-slate-500">Back to recovery codes</button></form>}
  </div></section></main>;
}
