'use client';

import { useEffect, useState } from 'react';
import { Check, Clipboard, Loader2, MailPlus, ShieldX } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  addPendingInvitationToRoster,
  createTeamInvitation,
  findLatestInvitationByEmail,
  invitationRoleLabel,
  markInvitationRevokedInRoster,
  revokeTeamInvitation,
  type TeamInviteRole,
  type TeamInvitation,
  validateTeamInvitationInput,
} from '@/lib/auth/team-invitations';
import { STUDIO_TIER_LABEL, TEAM_ROLE_TIER, tierAllows, useStudioEntitlements } from '@/lib/auth/studio-entitlements';

const fieldClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-rose-600 focus:ring-4 focus:ring-rose-100 dark:border-studio-700 dark:bg-studio-950 dark:text-white dark:focus:ring-rose-950';

export function TeamInviteModal({ open, onClose, defaultRole, studioName, onInvited }: {
  open: boolean;
  onClose: () => void;
  defaultRole: TeamInviteRole;
  studioName: string;
  onInvited?: () => void;
}) {
  const { addToast } = useToast();
  const { tier, tierLabel, loading: tierLoading } = useStudioEntitlements();
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: defaultRole });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ invitation: TeamInvitation; url: string; emailDelivery: 'sent' | 'not_configured' | 'sandbox_restricted' } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', email: '', phone: '', role: defaultRole });
    setErrors({});
    setResult(null);
    setCopied(false);
  }, [defaultRole, open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validateTeamInvitationInput(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    try {
      const created = await createTeamInvitation({ ...form, studioName });
      addPendingInvitationToRoster(created.invitation);
      setResult({ invitation: created.invitation, url: created.setupUrl, emailDelivery: created.emailDelivery });
      onInvited?.();
      addToast({
        type: created.emailDelivery === 'sent' ? 'success' : 'info',
        title: created.emailDelivery === 'sent'
          ? 'Invitation emailed'
          : created.emailDelivery === 'sandbox_restricted'
          ? 'Setup link created (Resend Sandbox)'
          : 'Invitation created',
        message: created.emailDelivery === 'sent'
          ? `A secure setup email was sent to ${form.email.trim()}.`
          : created.emailDelivery === 'sandbox_restricted'
          ? `Resend test account only delivers to marqetrondev@gmail.com. Copy the setup link below for ${form.name.trim()}.`
          : `${form.name.trim()} is pending setup; copy the link below in local development.`,
      });
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'The invitation could not be created.' });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      addToast({ type: 'success', title: 'Invitation link copied', message: 'Share it privately with the intended team member.' });
    } catch {
      setErrors({ form: 'Clipboard access was blocked. Select and copy the link manually.' });
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={result ? 'Invitation ready' : 'Invite Team Member'} description={result ? 'Secure, cross-device setup link created' : 'Create a single-use employee onboarding link'} size="md" closeOnBackdrop={!busy}>
      {result ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><Check className="size-5" /></span><div><p className="font-bold">{result.invitation.name}</p><p className="mt-1 text-xs">{invitationRoleLabel(result.invitation.role)} · expires in 48 hours · single use</p></div></div>
          </div>
          <div>
            <label htmlFor="invitation-link" className="text-xs font-bold text-slate-700 dark:text-slate-200">Invitation link</label>
            <textarea id="invitation-link" readOnly rows={3} value={result.url} onFocus={(event) => event.currentTarget.select()} className={`${fieldClass} mt-2 resize-none py-3 font-mono text-xs`} />
            <button type="button" onClick={copyLink} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white hover:bg-rose-800">
              {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}{copied ? 'Copied' : 'Copy Invitation Link'}
            </button>
          </div>
          {result.emailDelivery === 'sent' ? (
            <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-studio-950 dark:text-slate-300">
              The invitation was emailed to <strong>{result.invitation.email}</strong>. You can also copy the link for a secure direct handoff.
            </p>
          ) : result.emailDelivery === 'sandbox_restricted' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-bold">Resend Sandbox Delivery Notice</p>
              <p className="mt-1">
                Resend is running in test sandbox mode and only delivers emails to <strong>marqetrondev@gmail.com</strong>. Since <strong>{result.invitation.email}</strong> is a different address, Resend blocked inbox delivery. Please copy and share the single-use setup link above directly.
              </p>
              <p className="mt-1 text-[11px] opacity-80">
                To deliver to any email address in production, verify your custom sending domain at resend.com/domains.
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-studio-950 dark:text-slate-300">
              Email delivery is not configured in this development environment. Copy this link privately; it works on another browser or device and expires after 48 hours.
            </p>
          )}
          <button type="button" onClick={onClose} className="min-h-10 w-full rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-studio-700 dark:text-slate-200">Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {[['name', 'Full name', 'Ananya Rao', 'text'], ['email', 'Work email', 'ananya@yourstudio.in', 'email'], ['phone', 'Indian mobile number', '+91 98450 91122', 'tel']].map(([key, label, placeholder, type]) => (
            <label key={key} className="block text-xs font-bold text-slate-700 dark:text-slate-200">{label}<input type={type} value={form[key as 'name' | 'email' | 'phone']} placeholder={placeholder} onChange={(event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setErrors((current) => ({ ...current, [key]: '' })); }} aria-invalid={Boolean(errors[key])} className={`${fieldClass} mt-2`} />{errors[key] && <span role="alert" className="mt-1 block text-[11px] font-medium text-rose-700 dark:text-rose-300">{errors[key]}</span>}</label>
          ))}
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Role<select disabled={tierLoading} value={form.role} onChange={(event) => { setForm((current) => ({ ...current, role: event.target.value as TeamInviteRole })); setErrors((current) => ({ ...current, role: '' })); }} className={`${fieldClass} mt-2 disabled:opacity-60`}>{([
            ['front_desk', 'Front Desk'], ['staff', 'Staff'], ['trainer', 'Trainer'], ['admin', 'Administrator (owner approval)'],
            ['coach', 'Coach'], ['lead_trainer', 'Lead Trainer'], ['biller', 'Biller'], ['accountant', 'Accountant'],
          ] as Array<[TeamInviteRole, string]>).map(([role, label]) => { const required = TEAM_ROLE_TIER[role]; const allowed = tierAllows(tier, required); return <option key={role} value={role} disabled={!allowed}>{label}{allowed ? '' : ` — ${STUDIO_TIER_LABEL[required]} required`}</option>; })}</select><span className="mt-1 block text-[11px] font-medium text-slate-500">Active plan: {tierLabel}</span>{errors.role && <span role="alert" className="mt-1 block text-[11px] text-rose-700">{errors.role}</span>}</label>
          {errors.form && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{errors.form}</p>}
          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 disabled:opacity-50 dark:border-studio-700 dark:text-slate-200">Cancel</button><button type="submit" disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-700 px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />}{busy ? 'Creating…' : 'Create invitation'}</button></div>
        </form>
      )}
    </Modal>
  );
}

export function PendingInvitationActions({ email, onChanged }: { email: string; onChanged?: () => void }) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<TeamInvitation | null>(null);
  const [activeModalResult, setActiveModalResult] = useState<{ url: string; emailDelivery: 'sent' | 'not_configured' | 'sandbox_restricted'; invitation: TeamInvitation } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    findLatestInvitationByEmail(email).then((value) => {
      if (active) setInvitation(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [email]);

  if (!invitation || invitation.status !== 'pending') return null;

  async function revoke() {
    if (!invitation?.id) return;
    setBusy(true);
    try {
      await revokeTeamInvitation(invitation.id);
      markInvitationRevokedInRoster(invitation.email);
      setInvitation(null);
      addToast({ type: 'success', title: 'Invitation revoked', message: `${invitation.name} can no longer use the setup link.` });
      onChanged?.();
    } catch (error) {
      addToast({ type: 'error', title: 'Could not revoke', message: error instanceof Error ? error.message : 'Try again.' });
    } finally { setBusy(false); }
  }

  async function reinvite() {
    if (!invitation) return;
    setBusy(true);
    try {
      if (invitation.id) {
        await revokeTeamInvitation(invitation.id);
      }
      const created = await createTeamInvitation({
        name: invitation.name,
        email: invitation.email,
        phone: invitation.phone || '+919876543210',
        role: invitation.role,
        studioName: invitation.studioName,
      });
      setInvitation(created.invitation);
      setActiveModalResult({
        url: created.setupUrl,
        emailDelivery: created.emailDelivery,
        invitation: created.invitation,
      });
      addToast({
        type: created.emailDelivery === 'sent' ? 'success' : 'info',
        title: created.emailDelivery === 'sent' ? 'Invitation re-sent' : 'New setup link generated',
        message: created.emailDelivery === 'sent' ? `Email sent to ${invitation.email}` : 'Copy the setup link in the dialog',
      });
    } catch (error) {
      addToast({ type: 'error', title: 'Could not regenerate', message: error instanceof Error ? error.message : 'Try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function copyDirectLink() {
    if (!activeModalResult) return;
    try {
      await navigator.clipboard.writeText(activeModalResult.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      addToast({ type: 'success', title: 'Invitation link copied', message: 'Share it privately with the team member.' });
    } catch {
      addToast({ type: 'error', title: 'Copy failed', message: 'Please copy manually from the box.' });
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={reinvite}
          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-900"
          title="Regenerate single-use link & retry email delivery"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <MailPlus className="size-3" />}
          Get link / Resend
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={revoke}
          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-200 px-2.5 text-[10px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <ShieldX className="size-3" />}
          Revoke
        </button>
      </div>

      <Modal
        isOpen={Boolean(activeModalResult)}
        onClose={() => {
          setActiveModalResult(null);
          onChanged?.();
        }}
        title="Setup Link Generated"
        description="Fresh onboarding link ready for staff member"
        size="md"
      >
        {activeModalResult && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="font-bold">{activeModalResult.invitation.name}</p>
              <p className="mt-0.5 text-xs">{invitationRoleLabel(activeModalResult.invitation.role)} · expires in 48 hours · single use</p>
            </div>

            <div>
              <label htmlFor="resend-invitation-link" className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Setup link
              </label>
              <textarea
                id="resend-invitation-link"
                readOnly
                rows={3}
                value={activeModalResult.url}
                onFocus={(event) => event.currentTarget.select()}
                className={`${fieldClass} mt-1.5 resize-none py-2.5 font-mono text-xs`}
              />
              <button
                type="button"
                onClick={copyDirectLink}
                className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-xs font-bold text-white hover:bg-rose-800"
              >
                {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                {copied ? 'Copied' : 'Copy Invitation Link'}
              </button>
            </div>

            {activeModalResult.emailDelivery === 'sent' ? (
              <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-studio-950 dark:text-slate-300">
                The invitation was successfully emailed to <strong>{activeModalResult.invitation.email}</strong>.
              </p>
            ) : activeModalResult.emailDelivery === 'sandbox_restricted' ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-bold">Resend Sandbox Delivery Restriction</p>
                <p className="mt-1">
                  Resend is operating in test mode and only delivers emails to <strong>marqetrondev@gmail.com</strong>. Since <strong>{activeModalResult.invitation.email}</strong> is a different recipient, inbox delivery was blocked by Resend. Please copy and share the link above directly.
                </p>
                <p className="mt-1 text-[11px] opacity-80">
                  To send to any email address in production, verify your custom domain at resend.com/domains.
                </p>
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-studio-950 dark:text-slate-300">
                Email delivery is not configured in this development environment. Copy this link privately; it works on any device and expires after 48 hours.
              </p>
            )}

            <button
              type="button"
              onClick={() => setActiveModalResult(null)}
              className="min-h-10 w-full rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-studio-700 dark:text-slate-200"
            >
              Close
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
