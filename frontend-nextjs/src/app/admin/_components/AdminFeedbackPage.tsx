'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ActivityIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import { listTeamInvitations } from '@/lib/auth/team-invitations';
import {
  currentStaffStudio,
  useAdminWorkspaceData,
  type AdminSessionFeedback,
  type FeedbackCategory,
  type FeedbackReviewStatus,
} from './AdminDataProvider';
import { readStaffTeamTrainers } from './AdminWorkspacePages';

const panel =
  'min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-subtle dark:border-studio-700 dark:bg-studio-900';
const input =
  'min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-600/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100';

const dateLabel = (
  value: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
) => {
  if (!value) return 'Date not recorded';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', options);
};

export function AdminFeedbackPage() {
  const { feedback, setFeedback, classes, members, refresh } = useAdminWorkspaceData();
  const { addToast } = useToast();

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<'All' | FeedbackCategory>('All');
  const [personFilter, setPersonFilter] = useState('All people');
  const [ratingFilter, setRatingFilter] = useState('All ratings');
  const [statusFilter, setStatusFilter] = useState('All review statuses');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '7' | '30' | '90'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected for View / Edit Details
  const [selectedFeedback, setSelectedFeedback] = useState<AdminSessionFeedback | null>(null);

  // Edit details form inside modal
  const [detailCategory, setDetailCategory] = useState<FeedbackCategory>('Trainer');
  const [detailPerson, setDetailPerson] = useState('');
  const [detailStatus, setDetailStatus] = useState<FeedbackReviewStatus>('Awaiting Review');
  const [detailFollowUp, setDetailFollowUp] = useState('');

  // Delete confirmation
  const [feedbackToDelete, setFeedbackToDelete] = useState<AdminSessionFeedback | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper maps
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const sessionById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const trainersList = useMemo(
    () => Array.from(new Set([...readStaffTeamTrainers(), ...classes.map((item) => item.trainer)].filter(Boolean))).sort(),
    [classes]
  );
  const staffList = useMemo(
    () => Array.from(new Set(feedback.map((item) => item.staffName).filter((name): name is string => Boolean(name)))).sort(),
    [feedback],
  );

  const [teamStaffCount, setTeamStaffCount] = useState<number>(0);
  useEffect(() => {
    let active = true;
    listTeamInvitations()
      .then((rows) => {
        if (active) setTeamStaffCount(rows.filter((row) => row.status === 'accepted').length);
      })
      .catch(() => {
        if (active) setTeamStaffCount(0);
      });
    return () => {
      active = false;
    };
  }, []);

  const ratedFeedback = useMemo(() => feedback.filter((item) => Number.isFinite(item.rating)), [feedback]);
  const averageTrainerRating = useMemo(
    () => (ratedFeedback.length ? ratedFeedback.reduce((sum, item) => sum + item.rating, 0) / ratedFeedback.length : null),
    [ratedFeedback],
  );

  const trainerMetrics = useMemo(() => {
    return trainersList.map((name) => {
      const tFeedback = feedback.filter(
        (item) => (item.trainerName === name || (!item.trainerName && (item.comment || '').toLowerCase().includes(name.toLowerCase()))) && Number.isFinite(item.rating),
      );
      const average = tFeedback.length ? tFeedback.reduce((sum, item) => sum + item.rating, 0) / tFeedback.length : null;
      return {
        name,
        average,
        reviewCount: tFeedback.length,
      };
    }).sort((a, b) => {
      if (a.average !== null && b.average !== null) return b.average - a.average;
      if (a.average !== null) return -1;
      if (b.average !== null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [trainersList, feedback]);

  // Normalization & Auto-Categorization Helper
  const getFeedbackDetails = (item: AdminSessionFeedback) => {
    let category: FeedbackCategory = item.category || 'General';
    let person = item.trainerName || item.staffName || '';

    // If category not explicitly set, determine automatically
    if (!item.category) {
      if (item.staffName || staffList.some((s) => s.toLowerCase() === item.trainerName?.toLowerCase())) {
        category = 'Staff';
        person = item.staffName || item.trainerName;
      } else if (item.trainerName || item.sessionId) {
        category = 'Trainer';
        person = item.trainerName;
      } else {
        const commentLower = (item.comment || '').toLowerCase();
        const foundTrainer = trainersList.find((t) => commentLower.includes(t.toLowerCase()));
        const foundStaff = staffList.find((s) => commentLower.includes(s.toLowerCase()));

        if (foundTrainer) {
          category = 'Trainer';
          person = foundTrainer;
        } else if (foundStaff || commentLower.includes('front desk') || commentLower.includes('reception')) {
          category = 'Staff';
          person = foundStaff || 'Studio Team';
        } else {
          category = 'General';
          person = '';
        }
      }
    }

    return { category, person };
  };

  // Enriched & filtered feedback list
  const enrichedFeedback = useMemo(() => {
    return feedback.map((item) => {
      const { category, person } = getFeedbackDetails(item);
      const normalizedStatus: FeedbackReviewStatus =
        item.reviewStatus === 'New' ? 'Awaiting Review' : item.reviewStatus || 'Awaiting Review';
      return {
        ...item,
        category,
        resolvedPerson: person,
        reviewStatus: normalizedStatus,
      };
    });
  }, [feedback, trainersList, staffList]);

  // Summary counts
  const totalCount = enrichedFeedback.length;
  const awaitingCount = enrichedFeedback.filter(
    (item) => item.reviewStatus === 'Awaiting Review' || (item.reviewStatus as string) === 'New'
  ).length;
  const trainerCount = enrichedFeedback.filter((item) => item.category === 'Trainer').length;
  const staffCount = enrichedFeedback.filter((item) => item.category === 'Staff').length;

  // Filtered list
  const visibleFeedback = useMemo(() => {
    const now = Date.now();
    return enrichedFeedback.filter((item) => {
      // Category filter
      if (categoryFilter !== 'All' && item.category !== categoryFilter) {
        return false;
      }

      // Person filter
      if (personFilter !== 'All people' && item.resolvedPerson !== personFilter) {
        return false;
      }

      // Rating filter
      if (ratingFilter !== 'All ratings' && String(item.rating) !== ratingFilter.slice(0, 1)) {
        return false;
      }

      // Review status filter
      if (statusFilter !== 'All review statuses') {
        if (statusFilter === 'Awaiting Review') {
          if (item.reviewStatus !== 'Awaiting Review' && (item.reviewStatus as string) !== 'New') {
            return false;
          }
        } else if (item.reviewStatus !== statusFilter) {
          return false;
        }
      }

      // Date range filter
      if (dateRangeFilter !== 'all') {
        const itemTime = new Date(item.submittedAt).getTime();
        const daysAgo = Number(dateRangeFilter) * 86400000;
        if (now - itemTime > daysAgo) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const member = memberById.get(item.memberId);
        const session = sessionById.get(item.sessionId);
        const matches =
          (member?.name && member.name.toLowerCase().includes(q)) ||
          item.memberId.toLowerCase().includes(q) ||
          item.comment.toLowerCase().includes(q) ||
          item.resolvedPerson.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          (session?.name && session.name.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [
    enrichedFeedback,
    categoryFilter,
    personFilter,
    ratingFilter,
    statusFilter,
    dateRangeFilter,
    searchQuery,
    memberById,
    sessionById,
  ]);

  // Open detail modal
  const openDetailsModal = (record: typeof enrichedFeedback[0]) => {
    setSelectedFeedback(record);
    setDetailCategory(record.category);
    setDetailPerson(record.resolvedPerson);
    setDetailStatus(record.reviewStatus);
    setDetailFollowUp(record.followUpNote || '');
  };

  // Save changes from detail modal
  const saveDetailsChanges = async () => {
    if (!selectedFeedback) return;
    const isTrainer = detailCategory === 'Trainer';
    const isStaff = detailCategory === 'Staff';

    try {
      await ApiClient.updateFeedback(selectedFeedback.id, {
        category: detailCategory,
        trainerName: isTrainer ? detailPerson : undefined,
        staffName: isStaff ? detailPerson : undefined,
        reviewStatus: detailStatus,
        followUpNote: detailFollowUp.trim(),
      });
      await refresh();

      addToast({
        type: 'success',
        title: 'Feedback updated',
        message: 'Category, assignment, and review status were saved.',
      });

      setSelectedFeedback(null);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Update failed', message: err.message || 'Could not update feedback.' });
    }
  };

  // Quick toggle review status
  const quickUpdateStatus = async (id: string, nextStatus: FeedbackReviewStatus) => {
    try {
      await ApiClient.updateFeedback(id, { reviewStatus: nextStatus });
      await refresh();
      addToast({
        type: 'info',
        title: 'Status updated',
        message: `Marked as ${nextStatus}.`,
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Status update failed', message: err.message || 'Could not update status.' });
    }
  };

  // Confirm delete
  const confirmDeleteFeedback = async () => {
    if (!feedbackToDelete) return;
    setIsDeleting(true);

    try {
      await ApiClient.deleteFeedback(feedbackToDelete.id);
      await refresh();

      addToast({
        type: 'success',
        title: 'Feedback deleted',
        message: 'The feedback record was removed from the review queue.',
      });

      setFeedbackToDelete(null);
      setSelectedFeedback(null);
    } catch {
      addToast({ type: 'error', title: 'Deletion failed', message: 'Could not delete feedback record.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const clearFilters = () => {
    setCategoryFilter('All');
    setPersonFilter('All people');
    setRatingFilter('All ratings');
    setStatusFilter('All review statuses');
    setDateRangeFilter('all');
    setSearchQuery('');
  };

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      {/* Header */}
      <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end dark:border-studio-700">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
            Admin Review &amp; Quality · {currentStaffStudio.name}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Member Feedback &amp; Reviews
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Review and manage member feedback for trainers, front desk staff, and overall studio experience.
          </p>
        </div>
        <Link
          href="/member/home#session-feedback"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
        >
          <FileTextIcon size="xs" />
          Member Feedback Form →
        </Link>
      </header>

      {/* Top Summary Cards */}
      <section aria-label="Feedback overview metrics" className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className={`${panel} flex items-start gap-3 p-4`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <FileTextIcon size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Total Feedback
            </p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-slate-950 dark:text-white">
              {totalCount}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Submissions received</p>
          </div>
        </div>

        <div className={`${panel} flex items-start gap-3 p-4`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            <ActivityIcon size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Trainer Feedback
            </p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-slate-950 dark:text-white">
              {trainerCount}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Linked to coaches</p>
          </div>
        </div>

        <div className={`${panel} flex items-start gap-3 p-4`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <ShieldIcon size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Staff Feedback
            </p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-slate-950 dark:text-white">
              {staffCount}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Front desk &amp; team</p>
          </div>
        </div>
      </section>

      {/* Central Member Feedback Inbox */}
      <section className={`${panel} overflow-hidden`}>
        {/* Filter Controls Header */}
        <div className="border-b border-slate-100 p-4 dark:border-studio-800 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">
                Member Feedback Inbox
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Showing {visibleFeedback.length} of {totalCount} submissions · Synced across Member Portal and Studio Workspaces
              </p>
            </div>
            {(categoryFilter !== 'All' ||
              personFilter !== 'All people' ||
              ratingFilter !== 'All ratings' ||
              statusFilter !== 'All review statuses' ||
              dateRangeFilter !== 'all' ||
              searchQuery) && (
              <button
                type="button"
                onClick={clearFilters}
                className="self-start text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300 xl:self-auto"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Filters Bar */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative sm:col-span-2">
              <span className="sr-only">Search feedback</span>
              <SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search member, comment, trainer, or staff…"
                className={`${input} w-full pl-9`}
              />
            </div>

            <select
              aria-label="Filter category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
              className={input}
            >
              <option value="All">All Categories</option>
              <option value="Trainer">Trainer Feedback</option>
              <option value="Staff">Staff Feedback</option>
              <option value="General">General Feedback</option>
            </select>

            <select
              aria-label="Filter person"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              className={input}
            >
              <option value="All people">All People</option>
              <optgroup label="Trainers">
                {trainersList.map((t) => (
                  <option key={t} value={t}>
                    Trainer: {t}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Staff">
                {staffList.map((s) => (
                  <option key={s} value={s}>
                    Staff: {s}
                  </option>
                ))}
              </optgroup>
            </select>

            <select
              aria-label="Filter rating"
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className={input}
            >
              <option value="All ratings">All Ratings</option>
              {[5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={`${r} Stars`}>
                  {r} Stars ({r} ★)
                </option>
              ))}
            </select>

            <select
              aria-label="Filter review status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={input}
            >
              <option value="All review statuses">All Review Statuses</option>
              <option value="Awaiting Review">Awaiting Review</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Feedback List */}
        {visibleFeedback.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-studio-800 dark:text-slate-300">
              <FileTextIcon size="md" />
            </span>
            <h3 className="mt-4 font-serif text-lg font-bold text-slate-900 dark:text-white">
              No feedback matches filters
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Try adjusting your search terms or clearing the selected category and status filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-studio-800">
            {visibleFeedback.map((record) => {
              const member = memberById.get(record.memberId);
              const session = sessionById.get(record.sessionId);

              const categoryTone =
                record.category === 'Trainer'
                  ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200 border-blue-200 dark:border-blue-900'
                  : record.category === 'Staff'
                    ? 'bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200 border-violet-200 dark:border-violet-900'
                    : 'bg-slate-100 text-slate-700 dark:bg-studio-800 dark:text-slate-300 border-slate-200 dark:border-studio-700';

              const statusTone =
                record.reviewStatus === 'Awaiting Review'
                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 border-amber-200 dark:border-amber-900'
                  : record.reviewStatus === 'Reviewed'
                    ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200 border-blue-200 dark:border-blue-900'
                    : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900';

              return (
                <article
                  key={record.id}
                  className="flex flex-col gap-3 p-4 transition hover:bg-slate-50/70 sm:p-5 lg:flex-row lg:items-start lg:justify-between dark:hover:bg-studio-800/40"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {member?.name || record.memberId}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {dateLabel(record.submittedAt)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${categoryTone}`}
                      >
                        {record.category} Feedback
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusTone}`}
                      >
                        {record.reviewStatus}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {record.resolvedPerson && (
                        <p>
                          <strong>{record.category === 'Trainer' ? 'Trainer' : 'Staff'}:</strong>{' '}
                          {record.resolvedPerson}
                        </p>
                      )}
                      {session && (
                        <p>
                          <strong>Session:</strong> {session.name} ({session.category})
                        </p>
                      )}
                      <div className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                        <span>{'★'.repeat(record.rating)}</span>
                        <span>{record.rating} / 5</span>
                      </div>
                    </div>

                    <blockquote className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-800 dark:border-studio-800 dark:bg-studio-950/50 dark:text-slate-200">
                      &ldquo;{record.comment}&rdquo;
                    </blockquote>

                    {record.strengths && record.strengths.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">Highlights:</span>
                        {record.strengths.map((str) => (
                          <span
                            key={str}
                            className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            {str}
                          </span>
                        ))}
                      </div>
                    )}

                    {record.followUpNote && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        <strong>Admin follow-up note:</strong> {record.followUpNote}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-col lg:items-end">
                    <button
                      type="button"
                      onClick={() => openDetailsModal(record)}
                      className="min-h-9 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 dark:hover:border-rose-700"
                    >
                      View Details
                    </button>

                    <div className="flex gap-1.5">
                      {record.reviewStatus !== 'Reviewed' && (
                        <button
                          type="button"
                          onClick={() => quickUpdateStatus(record.id, 'Reviewed')}
                          className="min-h-8 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-[10px] font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
                        >
                          Mark Reviewed
                        </button>
                      )}
                      {record.reviewStatus !== 'Resolved' && (
                        <button
                          type="button"
                          onClick={() => quickUpdateStatus(record.id, 'Resolved')}
                          className="min-h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          Mark Resolved
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFeedbackToDelete(record)}
                        className="min-h-8 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Staff & Trainer Performance Section */}
      <section className={`${panel} p-4 sm:p-6`}>
        <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-serif text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
              Staff &amp; Trainer Performance
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Team overview &amp; verified trainer ratings from member feedback submissions
            </p>
          </div>
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
            Rating Scale 1.0 – 5.0
          </span>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-studio-700 dark:bg-studio-900/60">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Staff &amp; Trainers
            </p>
            <p className="mt-1.5 font-serif text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {teamStaffCount} <span className="font-sans text-xs font-normal text-slate-500">team members</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {trainersList.length} active trainers in studio roster
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-studio-700 dark:bg-studio-900/60">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Average Trainer Rating
            </p>
            <p className="mt-1.5 font-serif text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {averageTrainerRating !== null ? (
                <>
                  {averageTrainerRating.toFixed(1)}
                  <span className="font-sans text-xs font-normal text-slate-500"> / 5.0</span>
                </>
              ) : (
                '—'
              )}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {ratedFeedback.length
                ? `${ratedFeedback.length} recorded member rating${ratedFeedback.length === 1 ? '' : 's'}`
                : 'No member ratings recorded'}
            </p>
          </div>
        </div>

        {ratedFeedback.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-studio-700 dark:text-slate-400">
            Performance data not available yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
                Trainer Performance Comparison
              </h3>
              <span className="text-[10px] text-slate-400">Measured across sessions</span>
            </div>
            <div className="space-y-3">
              {trainerMetrics.map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</span>
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {item.average !== null ? (
                        <>
                          <strong className="text-slate-950 dark:text-white">{item.average.toFixed(1)} / 5</strong>
                          <span className="ml-1 text-slate-400">
                            ({item.reviewCount} {item.reviewCount === 1 ? 'rating' : 'ratings'})
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">No ratings yet</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-studio-800">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        item.average !== null ? 'bg-rose-500' : 'bg-slate-200 dark:bg-studio-700'
                      }`}
                      style={{ width: `${item.average !== null ? Math.min(100, (item.average / 5) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* View & Edit Feedback Details Modal */}
      <Modal
        isOpen={selectedFeedback !== null}
        onClose={() => setSelectedFeedback(null)}
        title="Feedback Details &amp; Actions"
        description="Review full comment, verify categorization, associate person, and update status"
        size="md"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {selectedFeedback && (
              <button
                type="button"
                onClick={() => setFeedbackToDelete(selectedFeedback)}
                className="min-h-10 rounded-lg border border-rose-200 bg-rose-50 px-3.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
              >
                Delete Feedback
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedFeedback(null)}
                className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
              >
                Close
              </button>
              <button
                type="button"
                onClick={saveDetailsChanges}
                className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800"
              >
                Save Changes
              </button>
            </div>
          </div>
        }
      >
        {selectedFeedback && (() => {
          const member = memberById.get(selectedFeedback.memberId);
          const session = sessionById.get(selectedFeedback.sessionId);

          return (
            <div className="space-y-4">
              {/* Member & Session Summary */}
              <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs sm:grid-cols-2 dark:border-studio-700 dark:bg-studio-950">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Member</dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {member?.name || selectedFeedback.memberId}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Submission Date</dt>
                  <dd className="mt-1 text-slate-700 dark:text-slate-300">
                    {dateLabel(selectedFeedback.submittedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rating</dt>
                  <dd className="mt-1 font-bold text-amber-600 dark:text-amber-400">
                    {'★'.repeat(selectedFeedback.rating)} ({selectedFeedback.rating}/5)
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Related Session</dt>
                  <dd className="mt-1 text-slate-700 dark:text-slate-300">
                    {session?.name ? `${session.name} (${session.category})` : 'None / Not session-tied'}
                  </dd>
                </div>
              </dl>

              {/* Full Comment */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Member Comment
                </label>
                <div className="mt-1.5 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-900 dark:border-studio-800 dark:bg-studio-900 dark:text-slate-100">
                  {selectedFeedback.comment}
                </div>
              </div>

              {/* Categorization & Association Options */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Feedback Category
                  <select
                    value={detailCategory}
                    onChange={(e) => setDetailCategory(e.target.value as FeedbackCategory)}
                    className={input}
                  >
                    <option value="Trainer">Trainer Feedback</option>
                    <option value="Staff">Staff Feedback</option>
                    <option value="General">General Feedback</option>
                  </select>
                </label>

                {detailCategory === 'Trainer' && (
                  <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Assigned Trainer
                    <select
                      value={detailPerson}
                      onChange={(e) => setDetailPerson(e.target.value)}
                      className={input}
                    >
                      <option value="">Unassigned</option>
                      {trainersList.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {detailCategory === 'Staff' && (
                  <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Assigned Staff Member
                    <select
                      value={detailPerson}
                      onChange={(e) => setDetailPerson(e.target.value)}
                      className={input}
                    >
                      <option value="">Unassigned</option>
                      {staffList.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {detailCategory === 'General' && (
                  <div className="grid gap-1.5 text-xs font-semibold text-slate-400">
                    Assigned Person
                    <input disabled value="None (General Studio)" className={`${input} opacity-60`} />
                  </div>
                )}
              </div>

              {/* Review Status & Follow-Up Note */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Review Status
                  <select
                    value={detailStatus}
                    onChange={(e) => setDetailStatus(e.target.value as FeedbackReviewStatus)}
                    className={input}
                  >
                    <option value="Awaiting Review">Awaiting Review</option>
                    <option value="Reviewed">Reviewed</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                Admin Follow-Up Note
                <textarea
                  rows={3}
                  value={detailFollowUp}
                  onChange={(e) => setDetailFollowUp(e.target.value)}
                  placeholder="Record internal notes, coach discussions, or resolution steps..."
                  className={`${input} resize-y py-2 font-normal`}
                />
              </label>
            </div>
          );
        })()}
      </Modal>

      {/* Delete Feedback Confirmation Modal */}
      <Modal
        isOpen={feedbackToDelete !== null}
        onClose={() => {
          if (!isDeleting) setFeedbackToDelete(null);
        }}
        title="Delete Feedback"
        description="Confirm feedback record deletion"
        size="sm"
        footer={
          <>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setFeedbackToDelete(null)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={confirmDeleteFeedback}
              className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting…' : 'Confirm Delete'}
            </button>
          </>
        }
      >
        {feedbackToDelete && (
          <div className="space-y-3">
            <p className="text-sm text-slate-800 dark:text-slate-200">
              Are you sure you want to delete this feedback record from <strong>{feedbackToDelete.memberId}</strong>?
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This will remove the submission from your workspace feedback queue and recalculate review totals.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
