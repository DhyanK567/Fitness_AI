'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { ApiClient } from '@/lib/api-client';
import { getStudioSession } from '@/lib/auth/studio-session';
import { BellIcon, CalendarIcon, CheckCircleIcon, ClockIcon, UsersIcon, XIcon } from '@/components/ui/icons';
import { AlertTriangle, Check, Layers } from 'lucide-react';

export interface StudioNotificationItem {
  id: string;
  type: 'session' | 'booking' | 'attendance' | 'alert';
  title: string;
  message: string;
  timestamp: string;
  timeAgo: string;
  read: boolean;
  linkHref?: string;
  actionLabel?: string;
}

interface StudioNotificationBellProps {
  role: 'trainer' | 'staff';
  className?: string;
}

export function StudioNotificationBell({ role, className = '' }: StudioNotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<StudioNotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const storageKey = `studio_notifications_read_${role}`;

  // Load read IDs from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        setReadIds(new Set(JSON.parse(raw)));
      }
    } catch {
      // Ignore parse errors
    }
  }, [storageKey]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Fetch real notifications from existing endpoints
  async function loadNotifications() {
    setLoading(true);
    try {
      const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTotalMins = currentHours * 60 + currentMinutes;

      const items: StudioNotificationItem[] = [];

      if (role === 'trainer') {
        const overview = await ApiClient.getTrainerOverview().catch(() => null);
        if (overview) {
          const sessions = overview.sessions || [];
          const bookings = overview.bookings || [];
          const attendance = overview.attendance || [];
          const memberMap = new Map((overview.members || []).map((m) => [m.id, m]));
          const attendanceMap = new Map(attendance.map((a) => [a.bookingId, a]));

          // 1. Today's sessions for this trainer
          sessions
            .filter((s) => s.date === todayIso || s.status === 'Scheduled')
            .slice(0, 3)
            .forEach((s) => {
              items.push({
                id: `trainer-sess-${s.id}`,
                type: 'session',
                title: `Today's Session: ${s.name}`,
                message: `Scheduled at ${s.startTime || '09:00 AM'} in ${s.room || 'Studio Floor'}. Capacity: ${s.capacity} members.`,
                timestamp: s.date || todayIso,
                timeAgo: 'Today',
                read: readIds.has(`trainer-sess-${s.id}`),
                linkHref: '/trainer/attendance',
                actionLabel: 'Open Roster',
              });
            });

          // 2. Confirmed bookings
          bookings
            .filter((b) => b.status?.toLowerCase() === 'confirmed')
            .slice(0, 3)
            .forEach((b) => {
              const member = memberMap.get(b.memberId);
              items.push({
                id: `trainer-book-${b.id}`,
                type: 'booking',
                title: 'Member Reserved Class',
                message: `${member?.fullName || 'A member'} booked a confirmed spot in your coaching session.`,
                timestamp: b.bookedAt || todayIso,
                timeAgo: 'Recent',
                read: readIds.has(`trainer-book-${b.id}`),
                linkHref: '/trainer/attendance',
                actionLabel: 'View Member',
              });
            });

          // 3. Attendance check-ins
          attendance.slice(0, 2).forEach((a) => {
            items.push({
              id: `trainer-att-${a.id}`,
              type: 'attendance',
              title: 'Floor Check-in Verified',
              message: `Member verified as ${a.status} for assigned training roster.`,
              timestamp: a.checkedInAt || todayIso,
              timeAgo: 'Today',
              read: readIds.has(`trainer-att-${a.id}`),
              linkHref: '/trainer/attendance',
              actionLabel: 'View Attendance',
            });
          });
        }
      } else {
        // Staff Dashboard notifications
        const overview = await ApiClient.getFrontDeskOverview().catch(() => null);
        if (overview) {
          const sessions = overview.sessions || [];
          const bookings = overview.bookings || [];
          const attendance = overview.attendance || [];
          const memberMap = new Map((overview.members || []).map((m) => [m.id, m]));
          const sessionMap = new Map(sessions.map((s) => [s.id, s]));
          const attendanceMap = new Map(attendance.map((a) => [a.bookingId, a]));

          // 1. Pending / Waitlisted booking requests needing front desk review
          const pendingBookings = bookings.filter((b) => b.status?.toLowerCase() === 'waitlisted');
          pendingBookings.slice(0, 3).forEach((b) => {
            const member = memberMap.get(b.memberId);
            const sess = sessionMap.get(b.classId);
            items.push({
              id: `staff-waitlist-${b.id}`,
              type: 'booking',
              title: 'Pending Booking Request',
              message: `${member?.fullName || 'Member'} requested a spot in ${sess?.name || 'Class Session'}.`,
              timestamp: b.bookedAt || todayIso,
              timeAgo: 'Pending Review',
              read: readIds.has(`staff-waitlist-${b.id}`),
              linkHref: '/staff/bookings',
              actionLabel: 'Review Request',
            });
          });

          // 2. Upcoming classes today
          const todayClasses = sessions.filter((s) => s.date === todayIso || s.status === 'Scheduled');
          todayClasses.slice(0, 2).forEach((s) => {
            items.push({
              id: `staff-sess-${s.id}`,
              type: 'session',
              title: `Upcoming Class: ${s.name}`,
              message: `Trainer ${s.trainer || 'Coach'} · ${s.startTime || '07:00 AM'} in ${s.room || 'Studio 1'}.`,
              timestamp: s.date || todayIso,
              timeAgo: 'Today',
              read: readIds.has(`staff-sess-${s.id}`),
              linkHref: '/staff/classes',
              actionLabel: 'View Schedule',
            });
          });

          // 3. Trainer attendance monitoring alert: check for sessions whose start time has arrived/passed
          todayClasses.forEach((s) => {
            if (s.startTime) {
              const [h = '0', m = '0'] = s.startTime.split(':');
              const sessStartMins = parseInt(h, 10) * 60 + parseInt(m, 10);
              // If session was scheduled in the past or right now and no attendance recorded
              const sessionBookings = bookings.filter((b) => b.classId === s.id);
              const hasCheckIn = sessionBookings.some((b) => attendanceMap.has(b.id));

              if (currentTotalMins > sessStartMins + 15 && !hasCheckIn && s.status === 'Scheduled') {
                items.push({
                  id: `staff-trainer-alert-${s.id}`,
                  type: 'alert',
                  title: 'Trainer Attendance Alert',
                  message: `${s.trainer || 'Assigned trainer'} attendance pending for ${s.name} (${s.startTime}).`,
                  timestamp: s.date || todayIso,
                  timeAgo: 'Action Needed',
                  read: readIds.has(`staff-trainer-alert-${s.id}`),
                  linkHref: '/staff/trainer-attendance',
                  actionLabel: 'Check Attendance',
                });
              }
            }
          });

          // 4. Recent arrivals marked Present
          attendance.slice(0, 2).forEach((a) => {
            const booking = bookings.find((b) => b.id === a.bookingId);
            const member = booking ? memberMap.get(booking.memberId) : null;
            items.push({
              id: `staff-checkin-${a.id}`,
              type: 'attendance',
              title: 'Member Check-in Recorded',
              message: `${member?.fullName || 'Studio member'} verified Present at the desk.`,
              timestamp: a.checkedInAt || todayIso,
              timeAgo: 'Completed',
              read: readIds.has(`staff-checkin-${a.id}`),
              linkHref: '/staff/class-attendance',
              actionLabel: 'Roster',
            });
          });
        }
      }

      setNotifications(items);
    } catch {
      // In case of error, show clean empty state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, [role, readIds.size]);

  function markAsRead(id: string) {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }

  function markAllAsRead() {
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(allIds)));
    } catch {}
  }

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !readIds.has(n.id)).length;
  }, [notifications, readIds]);

  const displayedNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !readIds.has(n.id));
    }
    return notifications;
  }, [notifications, filter, readIds]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="View studio notifications"
        aria-expanded={isOpen}
        title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-700 shadow-2xs transition hover:border-rose-300 hover:bg-rose-50/50 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 dark:hover:border-rose-800 cursor-pointer"
      >
        <BellIcon size="xs" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notifications panel"
          className="absolute right-0 top-11 z-50 w-80 sm:w-96 rounded-2xl border border-slate-200/90 bg-white shadow-xl dark:border-studio-700 dark:bg-studio-900 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#FCFAF8] px-4 py-3 dark:border-studio-800 dark:bg-studio-950/60">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-sm font-bold text-slate-900 dark:text-white">Notifications</h3>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {unreadCount} new
                </span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  All caught up
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 border-b border-slate-100 px-4 py-2 text-xs dark:border-studio-800">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                filter === 'all'
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                filter === 'unread'
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* List of Notification Items */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-studio-800">
            {displayedNotifications.map((item) => {
              const isRead = readIds.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => markAsRead(item.id)}
                  className={`flex items-start gap-3 p-3.5 transition hover:bg-slate-50/80 dark:hover:bg-studio-800/60 ${
                    !isRead ? 'bg-rose-50/20 dark:bg-rose-950/15' : ''
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {item.type === 'session' && (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                        <CalendarIcon size="xs" />
                      </span>
                    )}
                    {item.type === 'booking' && (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <UsersIcon size="xs" />
                      </span>
                    )}
                    {item.type === 'attendance' && (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                        <CheckCircleIcon size="xs" />
                      </span>
                    )}
                    {item.type === 'alert' && (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {item.title}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">{item.timeAgo}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                      {item.message}
                    </p>
                    {item.linkHref && (
                      <div className="mt-2 flex items-center justify-between">
                        <Link
                          href={item.linkHref}
                          onClick={() => {
                            markAsRead(item.id);
                            setIsOpen(false);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400"
                        >
                          <span>{item.actionLabel || 'View Details'}</span>
                          <span>&rarr;</span>
                        </Link>
                        {!isRead && (
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {displayedNotifications.length === 0 && (
              <div className="p-8 text-center">
                <BellIcon size="md" className="mx-auto text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Real-time operational alerts from your studio will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
