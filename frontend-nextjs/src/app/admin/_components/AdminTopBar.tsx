'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BellIcon, ChevronDownIcon, MapPinIcon, MenuIcon, MoonIcon, PlusIcon, SearchIcon, SunIcon } from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAdminTheme } from './AdminThemeProvider';
import {
  getStudioSession,
  studioRoleLabel,
  STUDIO_SESSION_EVENT,
  updateStudioSessionProfile,
  type StudioSession,
} from '@/lib/auth/studio-session';
import { currentStaffStudio, useAdminWorkspaceData } from './AdminDataProvider';
import { useTenantBranding } from '@/features/settings';
import {
  adminAssistantNavigation,
  adminNavigation,
  adminPageTitle,
  adminPrimaryNavigation,
} from './adminNavigation';
import { useStudioEntitlements } from '@/lib/auth/studio-entitlements';

export type StudioLocation = {
  id: string;
  name: string;
  city: string;
  branch: string;
  locationLine: string;
  address?: string;
  isSample?: boolean;
};

const defaultStudioLocation: StudioLocation = {
  id: 'default-indiranagar',
  name: currentStaffStudio.name,
  city: currentStaffStudio.city,
  branch: currentStaffStudio.branch,
  locationLine: currentStaffStudio.locationLine,
  isSample: true,
};

export type TenantSoftwareSubscription = {
  planName: 'Basic' | 'Premium' | 'Ultra Premium' | string;
  expiryDate: string;
  daysRemaining: number;
  status: 'Active' | 'Expiring Soon' | 'Expired';
  reminderNote?: string;
};

type AdminTopBarProps = { onMenuClick: () => void; menuExpanded: boolean };

export function AdminTopBar({ onMenuClick, menuExpanded }: AdminTopBarProps) {
  const { tierLabel } = useStudioEntitlements();
  const pathname = usePathname();
  const { theme, toggleTheme } = useAdminTheme();
  const { notifications, setNotifications } = useAdminWorkspaceData();
  const { addToast } = useToast();
  const { studioName } = useTenantBranding();

  const [accountOpen, setAccountOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locations, setLocations] = useState<StudioLocation[]>([defaultStudioLocation]);
  const [selectedLocation, setSelectedLocation] = useState<StudioLocation>(defaultStudioLocation);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [locationForm, setLocationForm] = useState({ name: '', city: '', branch: '', address: '' });
  const [locationFormError, setLocationFormError] = useState('');

  const [subscription, setSubscription] = useState<TenantSoftwareSubscription | null>(null);
  const [planSubscriptionOpen, setPlanSubscriptionOpen] = useState(false);
  const planSubscriptionRef = useRef<HTMLDivElement>(null);

  const [profileEditing, setProfileEditing] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [displayName, setDisplayName] = useState('Studio Admin');
  const [displayPhone, setDisplayPhone] = useState('+91 90000 00000');
  const [displayEmail, setDisplayEmail] = useState('');
  const [studioSession, setStudioSession] = useState<StudioSession | null>(null);
  const [draftName, setDraftName] = useState('Studio Admin');
  const [draftPhone, setDraftPhone] = useState('+91 90000 00000');
  const [draftEmail, setDraftEmail] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [draftAvatarPreview, setDraftAvatarPreview] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDetail, setReminderDetail] = useState('');
  const [reminderCategory, setReminderCategory] = useState('Classes & Schedule');
  const accountRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('fitness-studio:custom-locations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLocations([defaultStudioLocation, ...parsed]);
        }
      }
      const savedSelected = window.localStorage.getItem('fitness-studio:selected-location');
      if (savedSelected) {
        const parsedSelected = JSON.parse(savedSelected);
        if (parsedSelected?.id) {
          setSelectedLocation(parsedSelected);
        }
      }
      const savedSub = window.localStorage.getItem('fitness-ai:software-subscription');
      if (savedSub) {
        const parsedSub = JSON.parse(savedSub);
        if (parsedSub?.planName && parsedSub?.expiryDate && typeof parsedSub?.daysRemaining === 'number') {
          setSubscription(parsedSub);
        }
      }
    } catch {
      // ignore storage error
    }
  }, []);

  function handleLocationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocationFormError('');
    const name = locationForm.name.trim();
    const city = locationForm.city.trim();
    const branch = locationForm.branch.trim();
    const address = locationForm.address.trim();

    if (!name || !city || !branch) {
      setLocationFormError('Studio name, city, and branch/area are required.');
      return;
    }

    if (locations.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      setLocationFormError('A studio with that name already exists in your locations list.');
      return;
    }

    const newLoc: StudioLocation = {
      id: `loc-${Date.now()}`,
      name,
      city,
      branch,
      locationLine: `${city} · ${branch}`,
      address: address || undefined,
      isSample: false,
    };

    const nextLocations = [...locations, newLoc];
    setLocations(nextLocations);
    setSelectedLocation(newLoc);

    try {
      const customOnly = nextLocations.filter((l) => !l.isSample);
      window.localStorage.setItem('fitness-studio:custom-locations', JSON.stringify(customOnly));
      window.localStorage.setItem('fitness-studio:selected-location', JSON.stringify(newLoc));
    } catch {
      // storage error ignored
    }

    setAddLocationOpen(false);
    setLocationForm({ name: '', city: '', branch: '', address: '' });
    addToast({
      type: 'success',
      title: 'Location added locally',
      message: `${name} is now selectable in the studio header. Full database persistence and multi-studio data scoping require backend integration.`,
    });
  }

  const pages = useMemo(() => {
    const groupItems = adminNavigation.flatMap((group) => group.items);
    return [adminPrimaryNavigation, ...groupItems, adminAssistantNavigation];
  }, []);

  const results = query.trim()
    ? pages.filter((page) => `${page.label} ${page.href}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  useEffect(() => {
    const syncSession = () => {
      const session = getStudioSession();
      if (session) {
        setStudioSession(session);
        setDisplayName(session.name);
        setDisplayEmail(session.email);
        setDisplayPhone(session.phone);
        setAvatarPreview(session.avatarUrl ?? null);
        setDraftName(session.name);
        setDraftEmail(session.email);
        setDraftPhone(session.phone);
        setDraftAvatarPreview(session.avatarUrl ?? null);
      }
    };
    syncSession();
    window.addEventListener(STUDIO_SESSION_EVENT, syncSession);
    window.addEventListener('storage', syncSession);
    return () => {
      window.removeEventListener(STUDIO_SESSION_EVENT, syncSession);
      window.removeEventListener('storage', syncSession);
    };
  }, []);

  const roleLabel = studioRoleLabel(studioSession?.role ?? 'admin');
  const initials = (studioSession?.name ?? displayName)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const unreadCount = notifications.filter((item) => item.unread).length;

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setDraftAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function handleSaveProfile() {
    setProfileError('');
    setProfileNotice('');
    const result = updateStudioSessionProfile({
      name: draftName,
      email: draftEmail,
      phone: draftPhone,
      avatarUrl: draftAvatarPreview,
    });
    if (result.error || !result.session) {
      setProfileError(result.error ?? 'Could not save profile.');
      return;
    }
    setStudioSession(result.session);
    setDisplayName(result.session.name);
    setDisplayPhone(result.session.phone);
    setDisplayEmail(result.session.email);
    setAvatarPreview(result.session.avatarUrl ?? null);
    setProfileEditing(false);
    setProfileNotice('Profile display preferences saved for this browser.');
  }

  useEffect(() => {
    if (!accountOpen && !searchOpen && !locationOpen && !notificationsOpen && !planSubscriptionOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!accountRef.current?.contains(target)) setAccountOpen(false);
      if (!locationRef.current?.contains(target)) setLocationOpen(false);
      if (!searchRef.current?.contains(target) && !mobileSearchRef.current?.contains(target)) setSearchOpen(false);
      if (!notificationsRef.current?.contains(target)) setNotificationsOpen(false);
      if (!planSubscriptionRef.current?.contains(target)) setPlanSubscriptionOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        setSearchOpen(false);
        setLocationOpen(false);
        setNotificationsOpen(false);
        setPlanSubscriptionOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountOpen, searchOpen, locationOpen, notificationsOpen, planSubscriptionOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[4.75rem] shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-sm sm:gap-3 sm:px-5 lg:px-7">
      <span className="hidden shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 sm:inline-flex">{tierLabel}</span>
      <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
        <button type="button" aria-label="Open navigation" aria-controls="admin-navigation" aria-expanded={menuExpanded} onClick={onMenuClick} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] lg:hidden">
          <MenuIcon size="sm" />
        </button>
        <div className="relative min-w-0 shrink-0" ref={locationRef}>
          <button
            type="button"
            aria-expanded={locationOpen}
            aria-label={`Current studio: ${selectedLocation.name}, ${selectedLocation.locationLine}`}
            title="View available locations"
            onClick={() => setLocationOpen((open) => !open)}
            className="flex min-w-0 max-w-[205px] items-center gap-2 rounded-lg px-1 py-1 text-left sm:max-w-[245px] sm:px-2 hover:bg-slate-50 dark:hover:bg-studio-800 transition"
          >
            <MapPinIcon size="sm" className="shrink-0 text-rose-700" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{selectedLocation.id === 'default-indiranagar' ? (studioName || selectedLocation.name) : selectedLocation.name}</span>
              <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{selectedLocation.locationLine}</span>
            </span>
            <ChevronDownIcon size="xs" className="hidden shrink-0 text-slate-400 sm:inline-block" />
          </button>
          {locationOpen && (
            <div role="menu" aria-label="Available locations" className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-elevated dark:border-studio-700 dark:bg-studio-900">
              <p className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Available locations</p>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {locations.map((loc) => {
                  const isSelected = loc.id === selectedLocation.id;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setSelectedLocation(loc);
                        setLocationOpen(false);
                        try {
                          window.localStorage.setItem('fitness-studio:selected-location', JSON.stringify(loc));
                        } catch {
                          // ignore
                        }
                      }}
                      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs transition ${
                        isSelected
                          ? 'bg-rose-50 font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-studio-800'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{loc.name}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-500 dark:text-slate-400">{loc.locationLine}</span>
                      </span>
                      {isSelected && <span aria-hidden="true" className="shrink-0 text-rose-700 dark:text-rose-300">✓</span>}
                    </button>
                  );
                })}
              </div>

              <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-studio-800">
                <button
                  type="button"
                  onClick={() => {
                    setLocationOpen(false);
                    setAddLocationOpen(true);
                    setLocationFormError('');
                    setLocationForm({ name: '', city: '', branch: '', address: '' });
                  }}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                >
                  <PlusIcon size="xs" />
                  <span>+ Add Location</span>
                </button>
                <p className="mt-1 px-2 text-[9px] leading-3 text-slate-400">
                  {locations.length} location{locations.length === 1 ? '' : 's'} in workspace preview.
                </p>
              </div>
            </div>
          )}
        </div>
        <span className="hidden h-8 border-l border-slate-200 lg:block" />
        <p className="hidden max-w-44 truncate text-xs font-medium text-slate-500 lg:block">{adminPageTitle(pathname)}</p>
      </div>

      <div ref={searchRef} className="relative hidden min-w-40 max-w-64 flex-1 md:block lg:max-w-sm">
        <label className="relative block">
          <span className="sr-only">Search admin pages</span>
          <SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setSearchOpen(true)} onKeyDown={(event) => { if (event.key === 'Enter' && results[0]) window.location.assign(results[0].href); }} placeholder="Search admin workspace..." className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
        </label>
        {searchOpen && query.trim() && <div role="listbox" aria-label="Workspace search results" className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-elevated">
          {results.length ? results.map(({ label, href, icon: Icon }) => <Link key={href} href={href} role="option" aria-selected="false" onClick={() => { setSearchOpen(false); setQuery(''); }} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-rose-800"><Icon size="sm" className="text-slate-400" />{label}</Link>) : <p className="px-3 py-3 text-xs text-slate-500">No workspace pages match “{query}”.</p>}
          <p className="border-t border-slate-100 px-2.5 py-2 text-[10px] text-slate-400">Searches pages available to {roleLabel}</p>
        </div>}
      </div>

      {/* Fitness AI Software Subscription Plan Expiry Notification */}
      <div ref={planSubscriptionRef} className="relative shrink-0">
        <button
          type="button"
          aria-expanded={planSubscriptionOpen}
          aria-haspopup="dialog"
          onClick={() => {
            setPlanSubscriptionOpen((prev) => !prev);
            setAccountOpen(false);
            setLocationOpen(false);
            setNotificationsOpen(false);
            setSearchOpen(false);
          }}
          aria-label={
            subscription
              ? `Fitness AI Software Plan: ${subscription.planName}, ${subscription.daysRemaining} days remaining`
              : 'Fitness AI Software Plan Expiry notification'
          }
          className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-xs font-semibold transition ${
            subscription?.status === 'Expired'
              ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
              : subscription?.daysRemaining !== undefined && subscription.daysRemaining <= 15
              ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-300'
          }`}
        >
          <BellIcon size="xs" className={subscription ? (subscription.status === 'Expired' ? 'text-rose-600' : 'text-amber-600') : 'text-slate-400'} />
          <span className="hidden sm:inline">Plan Expiry</span>
          <span className="sm:hidden">Plan</span>
          {subscription && (
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${
                subscription.status === 'Expired'
                  ? 'bg-rose-600'
                  : subscription.daysRemaining <= 15
                  ? 'bg-amber-600'
                  : 'bg-slate-700'
              }`}
            >
              {subscription.daysRemaining <= 0 ? '!' : `${subscription.daysRemaining}d`}
            </span>
          )}
        </button>

        {planSubscriptionOpen && (
          <section
            role="dialog"
            aria-label="Fitness AI Software Subscription Expiry"
            className="absolute left-0 sm:left-auto sm:right-0 top-full z-50 mt-2 w-[min(26rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-elevated dark:border-studio-700 dark:bg-studio-900"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-studio-800">
              <div>
                <span className="inline-block rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  Fitness AI Web App
                </span>
                <h2 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                  Software Subscription Plan
                </h2>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  Studio tenant platform license &amp; entitlements
                </p>
              </div>
              <button
                type="button"
                aria-label="Close software subscription notification"
                onClick={() => setPlanSubscriptionOpen(false)}
                className="rounded-lg p-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-studio-800 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {subscription ? (
              <div className="mt-3.5 space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-studio-700 dark:bg-studio-950">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Plan Tier</span>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{subscription.planName}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      subscription.status === 'Expired'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : subscription.daysRemaining <= 15
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}
                  >
                    {subscription.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-200 p-2.5 dark:border-studio-700">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Expiry Date</span>
                    <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{subscription.expiryDate}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-2.5 dark:border-studio-700">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Days Remaining</span>
                    <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                      {subscription.daysRemaining <= 0
                        ? `${Math.abs(subscription.daysRemaining)} days overdue`
                        : `${subscription.daysRemaining} days`}
                    </p>
                  </div>
                </div>

                {subscription.reminderNote && (
                  <div
                    className={`rounded-xl border p-3 text-xs leading-5 ${
                      subscription.status === 'Expired'
                        ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
                        : subscription.daysRemaining <= 15
                        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300'
                    }`}
                  >
                    <strong>
                      {subscription.status === 'Expired'
                        ? 'Expired Notice:'
                        : subscription.daysRemaining <= 15
                        ? 'Renewal Reminder:'
                        : 'Upcoming Expiry Reminder:'}
                    </strong>{' '}
                    {subscription.reminderNote}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3.5 space-y-3">
                <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500 dark:border-studio-700 dark:text-slate-400">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Subscription details will be available after backend integration.</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                    Your Fitness AI platform software subscription tier (Basic, Premium, or Ultra Premium) and license renewal dates will be synchronized with your tenant account.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-[11px] leading-4 text-slate-500 dark:border-studio-800 dark:bg-studio-950/50 dark:text-slate-400">
                  <strong className="text-slate-700 dark:text-slate-300">Tenant Account Notice:</strong> Platform subscription tracking requires backend integration to map the logged-in admin identity to a tenant billing record.
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[10px] text-slate-400 dark:border-studio-800">
              <span>Fitness AI Application License</span>
              <span>Software Plan Status</span>
            </div>
          </section>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <div ref={mobileSearchRef} className="relative md:hidden"><button type="button" aria-label="Search workspace pages" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)} className="inline-flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"><SearchIcon size="sm" /></button>{searchOpen && <div className="absolute right-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-2 shadow-elevated"><label className="relative block"><span className="sr-only">Search admin pages</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search admin workspace..." className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20" /></label>{query.trim() && <ul role="listbox" aria-label="Workspace search results" className="mt-1 max-h-64 overflow-y-auto">{results.length ? results.map(({ label, href, icon: Icon }) => <li key={href}><Link href={href} role="option" aria-selected="false" onClick={() => { setSearchOpen(false); setQuery(''); }} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Icon size="sm" className="text-slate-400" />{label}</Link></li>) : <li className="px-3 py-3 text-xs text-slate-500">No matching workspace pages.</li>}</ul>}<p className="px-2.5 pt-2 text-[10px] text-slate-400">Workspace pages ({roleLabel})</p></div>}</div>
        <button type="button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-pressed={theme === 'dark'} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={toggleTheme} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]">{theme === 'light' ? <MoonIcon size="sm" /> : <SunIcon size="sm" />}</button>
        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
            onClick={() => setNotificationsOpen((open) => !open)}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            title="Notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]"
          >
            <BellIcon size="sm" />
            {unreadCount > 0 && (
              <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <section role="dialog" aria-label="Studio notifications" className="absolute right-0 top-full z-50 mt-2 max-h-[min(80dvh,34rem)] w-[min(25rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3.5 shadow-elevated">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-1 pb-2.5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Notifications &amp; Reminders</h2>
                  <p className="mt-0.5 text-[10px] text-slate-500">{unreadCount} unread · {roleLabel} workspace</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setNotifications((current) => current.map((item) => ({ ...item, unread: false })))}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Close notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[10px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setNotificationFilter('all')}
                    className={`rounded-md px-2.5 py-1 ${notificationFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotificationFilter('unread')}
                    className={`rounded-md px-2.5 py-1 ${notificationFilter === 'unread' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    Unread ({unreadCount})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setReminderOpen((prev) => !prev)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-800 hover:bg-rose-100"
                >
                  {reminderOpen ? 'Cancel reminder' : '+ Post reminder'}
                </button>
              </div>

              {reminderOpen && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!reminderTitle.trim()) return;
                    const created = {
                      id: `ntf-${Date.now()}`,
                      title: reminderTitle.trim(),
                      detail: reminderDetail.trim() || `Operational reminder logged by ${displayName} (${roleLabel}).`,
                      category: reminderCategory,
                      createdAt: new Date().toISOString().slice(0, 16),
                      unread: true,
                    };
                    setNotifications((current) => [created, ...current]);
                    setReminderTitle('');
                    setReminderDetail('');
                    setReminderOpen(false);
                  }}
                  className="mt-2.5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">New Studio Reminder</p>
                  <input
                    value={reminderTitle}
                    onChange={(event) => setReminderTitle(event.target.value)}
                    placeholder="Reminder title (e.g. Check Studio A reformer straps)"
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
                    required
                  />
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select
                      value={reminderCategory}
                      onChange={(event) => setReminderCategory(event.target.value)}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                    >
                      <option value="Classes & Schedule">Classes &amp; Schedule</option>
                      <option value="Memberships">Memberships</option>
                      <option value="CRM / Leads">CRM / Leads</option>
                      <option value="Bookings">Bookings</option>
                      <option value="Payments">Payments</option>
                    </select>
                    <button
                      type="submit"
                      className="h-8 rounded-lg bg-slate-900 px-3 text-[11px] font-semibold text-white hover:bg-slate-800"
                    >
                      Save
                    </button>
                  </div>
                  <input
                    value={reminderDetail}
                    onChange={(event) => setReminderDetail(event.target.value)}
                    placeholder="Optional notes or instructions..."
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
                  />
                </form>
              )}

              {notifications.filter((item) => (notificationFilter === 'unread' ? item.unread : true)).length ? (
                <ul className="mt-2.5 space-y-2">
                  {[...notifications]
                    .filter((item) => (notificationFilter === 'unread' ? item.unread : true))
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((item) => {
                      const targetHref =
                        item.category === 'Memberships'
                          ? '/admin/memberships'
                          : item.category === 'CRM / Leads'
                          ? '/admin/leads'
                          : item.category === 'Classes & Schedule'
                          ? '/admin/classes'
                          : item.category === 'Schedule & Attendance'
                          ? '/admin/attendance'
                          : item.category === 'Bookings'
                          ? '/admin/bookings'
                          : item.category === 'Payments'
                          ? '/admin/payments'
                          : '/admin/dashboard';
                      return (
                        <li key={item.id} className={`rounded-xl border p-3 ${item.unread ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-700">
                                  {item.category}
                                </span>
                                <span className="text-[9px] text-slate-400">
                                  {new Intl.DateTimeFormat('en-US', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true,
                                  })
                                    .format(new Date(item.createdAt))
                                    .replace(/\b(am|pm)\b/i, (part) => part.toUpperCase())}
                                </span>
                              </div>
                              <p className="mt-1 text-xs font-semibold text-slate-900">{item.title}</p>
                              <p className="mt-0.5 text-[10px] leading-4 text-slate-600">{item.detail}</p>
                              <Link
                                href={targetHref}
                                onClick={() => setNotificationsOpen(false)}
                                className="mt-1.5 inline-block text-[10px] font-semibold text-rose-700 hover:underline"
                              >
                                Open in workspace →
                              </Link>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setNotifications((current) =>
                                  current.map((notification) =>
                                    notification.id === item.id ? { ...notification, unread: !notification.unread } : notification
                                  )
                                )
                              }
                              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {item.unread ? 'Mark read' : 'Mark unread'}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p className="mt-2.5 rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
                  {notificationFilter === 'unread' ? 'All studio notifications have been read.' : 'No notifications recorded in this workspace yet.'}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[10px] text-slate-400">
                <span>Synced in local browser state</span>
                <span>{notifications.length} total alert{notifications.length === 1 ? '' : 's'}</span>
              </div>
            </section>
          )}
        </div>
        <div className="relative shrink-0" ref={accountRef}>
          <button type="button" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => { setAccountOpen((open) => !open); setProfileNotice(''); setProfileError(''); }} className="flex min-h-10 items-center gap-2 rounded-lg px-1.5 text-left text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] sm:border sm:border-slate-200 sm:bg-white sm:px-2.5 dark:sm:border-slate-700 dark:sm:bg-slate-800">
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-[10px] font-bold text-white">{avatarPreview ? <img src={avatarPreview} alt="" className="h-full w-full object-cover" /> : initials}</span>
            <span className="hidden sm:block"><span className="block text-xs font-semibold text-slate-800">{displayName}</span><span className="block text-[10px] text-slate-500">{roleLabel}</span></span>
            <ChevronDownIcon size="xs" className="hidden text-slate-400 sm:block" />
          </button>
          {accountOpen && <div role="menu" aria-label="Admin account menu" className="absolute right-0 top-full mt-2 max-h-[calc(100dvh-5.5rem)] w-[min(21rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-elevated">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-sm font-bold text-white">{avatarPreview ? <img src={avatarPreview} alt="" className="h-full w-full object-cover" /> : initials}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                <span className="mt-1 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{roleLabel}</span>
              </div>
            </div>
            <p className="mt-3 break-all text-xs text-slate-600">{displayEmail}</p>
            {displayPhone && <p className="mt-0.5 text-[11px] text-slate-500">{displayPhone}</p>}
            {profileNotice && <p role="status" className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">{profileNotice}</p>}
            <button type="button" aria-expanded={profileEditing} onClick={() => { const editing = !profileEditing; setProfileEditing(editing); setProfileError(''); setProfileNotice(''); if (editing) { setDraftName(displayName); setDraftPhone(displayPhone); setDraftEmail(displayEmail); setDraftAvatarPreview(avatarPreview); } }} className="mt-3 flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{profileEditing ? 'Close profile editor' : 'View / Edit Profile'}</button>
            {profileEditing && <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-sm font-bold text-white">{draftAvatarPreview ? <img src={draftAvatarPreview} alt="Profile preview" className="h-full w-full object-cover" /> : initials}</span>
                <div className="min-w-0 flex-1">
                  <label htmlFor="admin-profile-photo" className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Change picture</label>
                  {draftAvatarPreview && <button type="button" onClick={() => setDraftAvatarPreview(null)} className="mt-1 min-h-8 w-full text-xs font-medium text-rose-700 hover:text-rose-900 dark:text-rose-300">Remove picture</button>}
                </div>
              </div>
              <input id="admin-profile-photo" type="file" accept="image/*" onChange={handlePhotoChange} className="sr-only" />
              <label htmlFor="admin-profile-name" className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Name</label>
              <input id="admin-profile-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              <label htmlFor="admin-profile-phone" className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Phone number</label>
              <input id="admin-profile-phone" type="tel" autoComplete="tel" value={draftPhone} onChange={(event) => setDraftPhone(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              <label htmlFor="admin-profile-email" className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Email</label>
              <input id="admin-profile-email" type="email" autoComplete="email" value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Role · read only</p><p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{roleLabel}</p>
              {profileError && <p role="alert" className="mt-2 text-xs font-medium text-rose-700">{profileError}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={handleSaveProfile} className="min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600">Save</button>
                <button type="button" onClick={() => { setProfileEditing(false); setProfileError(''); setDraftAvatarPreview(avatarPreview); }} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-400">Display preferences are local to this browser</p>
            </div>}
          </div>}
        </div>
      </div>
    </header>

    {/* In-page Add Studio Location Modal */}
    <Modal
      isOpen={addLocationOpen}
      onClose={() => {
        setAddLocationOpen(false);
        setLocationFormError('');
        setLocationForm({ name: '', city: '', branch: '', address: '' });
      }}
      title="Add Studio Location"
      description="Add a new branch or location to preview in the admin header."
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setAddLocationOpen(false);
              setLocationFormError('');
              setLocationForm({ name: '', city: '', branch: '', address: '' });
            }}
            className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:border-studio-700 dark:text-slate-300 dark:hover:bg-studio-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-location-form"
            className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
          >
            Save Location
          </button>
        </div>
      }
    >
      <form id="add-location-form" onSubmit={handleLocationSubmit} className="space-y-3.5">
        {locationFormError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
          >
            {locationFormError}
          </div>
        )}

        <div>
          <label htmlFor="modal-studio-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            Studio Name <span className="text-rose-600">*</span>
          </label>
          <input
            id="modal-studio-name"
            type="text"
            required
            value={locationForm.name}
            onChange={(e) => setLocationForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Koramangala Studio"
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="modal-studio-city" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              City <span className="text-rose-600">*</span>
            </label>
            <input
              id="modal-studio-city"
              type="text"
              required
              value={locationForm.city}
              onChange={(e) => setLocationForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="e.g. Bengaluru"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="modal-studio-branch" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Branch / Area <span className="text-rose-600">*</span>
            </label>
            <input
              id="modal-studio-branch"
              type="text"
              required
              value={locationForm.branch}
              onChange={(e) => setLocationForm((f) => ({ ...f, branch: e.target.value }))}
              placeholder="e.g. 4th Block"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label htmlFor="modal-studio-address" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            Address Details <span className="text-[10px] font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="modal-studio-address"
            rows={2}
            value={locationForm.address}
            onChange={(e) => setLocationForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="e.g. 80 Feet Road, 4th Block, Koramangala"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
          />
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] leading-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <strong>Workspace preview mode:</strong> This location will be saved to your local browser state and selectable in the header. Permanent database persistence and studio-specific record partitioning require backend integration.
        </div>
      </form>
    </Modal>
  </>
  );
}
