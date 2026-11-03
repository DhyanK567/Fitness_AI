'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { ApiClient, ClassItem } from '@/lib/api-client';
import { AiApi, AiApiError } from '@/features/ai/api/ai-api';
import {
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  CheckIcon,
  SearchIcon,
  ShieldCheckIcon,
  QrCodeIcon,
} from '@/components/ui/icons';
import { formatInr } from '@/lib/localization/india';
import {
  BotIcon,
  SparklesIcon,
  UserIcon,
  Loader2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  XCircleIcon,
  ChevronRightIcon,
  SendIcon,
  RefreshCwIcon,
} from 'lucide-react';

interface BookingAssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  type?: string;
  tools_used?: Array<{ name: string; status: string }>;
  pending_action?: {
    id: string;
    tool: string;
    summary: string;
    arguments_preview?: Record<string, unknown>;
    expires_at?: string;
    confirm_token?: string;
    status?: 'proposed' | 'confirmed' | 'failed' | 'declined' | 'uncertain';
    record_id?: string;
    error?: string;
  };
  timestamp: string;
}

function MemberBookClassContent() {
  const { user, activeMembership } = useAuthContext();
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  const preselectedClassId = searchParams?.get('classId');
  const preselectedClassName = searchParams?.get('className');
  const preselectedCategory = searchParams?.get('category');

  // Mode: Catalogue (default manual view) or AI Assistant (natural language booking)
  const [viewMode, setViewMode] = useState<'catalogue' | 'assistant'>('catalogue');

  // Catalogue state
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookingSession, setBookingSession] = useState<any | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);

  // Apply query parameter preselection from recommendations
  useEffect(() => {
    if (preselectedCategory) {
      setSelectedCategory(preselectedCategory);
    }
    if (preselectedClassName) {
      setSearchQuery(preselectedClassName);
    }
  }, [preselectedCategory, preselectedClassName]);

  useEffect(() => {
    if (preselectedClassId && classes.length > 0) {
      const match = classes.find((c) => c.id === preselectedClassId);
      if (match) {
        setBookingSession(match);
      }
    }
  }, [preselectedClassId, classes]);

  // AI Assistant state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BookingAssistantMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [confirmingActionId, setConfirmingActionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load classes for manual catalogue
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await ApiClient.getClasses();
        if (active) {
          if (Array.isArray(data) && data.length > 0) {
            setClasses(
              data.map((c: ClassItem) => ({
                id: c.id,
                classTitle: c.name,
                category: c.category || 'General',
                duration: `${c.duration_mins || 60} min`,
                intensity: 'Moderate',
                location: c.location || 'Indiranagar Sanctuary',
                instructor: 'Studio Trainer',
                date: 'Scheduled',
                time: 'Daily Sessions',
                spotsLeft: c.capacity ?? 10,
                price: c.price ?? 850,
                imageUrl:
                  c.imageUrl ||
                  'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80',
              })),
            );
          } else {
            setClasses([]);
          }
        }
      } catch (err: any) {
        if (active) {
          setLoadError(err?.message || 'Could not load studio class schedule.');
          setClasses([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  // Initialize or resume AI booking assistant session
  const initAssistantSession = async () => {
    if (sessionId) return;
    try {
      setSessionError(null);
      const res = await AiApi.createSession();
      if (res && res.session_id) {
        setSessionId(res.session_id);
      }
    } catch (err: any) {
      // Gracefully record session init error
      setSessionError(err?.message || 'AI Booking Assistant connection unavailable.');
    }
  };

  useEffect(() => {
    if (viewMode === 'assistant' && !sessionId) {
      initAssistantSession();
    }
  }, [viewMode, sessionId]);

  // Auto-scroll messages
  useEffect(() => {
    if (viewMode === 'assistant') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, viewMode]);

  const filteredSessions = classes.filter((s) => {
    const matchesCat = selectedCategory === 'All' || s.category === selectedCategory;
    const matchesSearch =
      s.classTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.instructor.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Manual booking confirmation handler
  const handleConfirmBooking = async () => {
    if (!bookingSession) return;
    try {
      const result = await ApiClient.createBooking({
        member_id: user?.id,
        class_schedule_id: bookingSession.id,
        booking_date: new Date().toISOString(),
      });
      const isWaitlist = result?.status === 'waitlisted';
      const bookingResult = {
        bookingRef: result?.id || `WS-BK-${Date.now()}`,
        session: bookingSession,
        isWaitlist,
        confirmedAt: result?.booked_at || new Date().toISOString(),
      };
      setConfirmedBooking(bookingResult);
      addToast({
        type: isWaitlist ? 'info' : 'success',
        title: isWaitlist ? 'Waitlist Joined' : 'Booking Confirmed!',
        message: isWaitlist
          ? `Added to waitlist for ${bookingSession.classTitle}. Ref: ${bookingResult.bookingRef}`
          : `Spot reserved for ${bookingSession.classTitle}. Ref: ${bookingResult.bookingRef}`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Booking Failed',
        message: err?.message || 'Could not reserve class. Please verify your membership credits and try again.',
      });
    } finally {
      setBookingSession(null);
    }
  };

  // AI Assistant message submit
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || isThinking) return;

    setInputText('');
    setIsThinking(true);
    setSessionError(null);

    const userMsg: BookingAssistantMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        const sessionRes = await AiApi.createSession();
        activeSessionId = sessionRes.session_id;
        setSessionId(activeSessionId);
      }

      const res = await AiApi.sendMessage(activeSessionId, query);

      const assistantMsg: BookingAssistantMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        text: res.text,
        type: res.type,
        tools_used: res.tools_used,
        pending_action: res.pending_action
          ? {
              id: res.pending_action.id,
              tool: res.pending_action.tool,
              summary: res.pending_action.summary,
              arguments_preview: res.pending_action.arguments_preview,
              expires_at: res.pending_action.expires_at,
              confirm_token: res.pending_action.confirm_token,
              status: 'proposed',
            }
          : undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to communicate with AI Booking Assistant.';
      setSessionError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'system',
          text: `⚠️ **Notice:** ${errMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  // Confirm pending two-phase action
  const handleConfirmPendingAction = async (msgId: string, actionId: string, confirmToken?: string) => {
    setConfirmingActionId(actionId);
    try {
      const result = await AiApi.confirmAction(actionId, confirmToken);

      if (result.status === 'succeeded') {
        const recordId = result.record_id || actionId;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.pending_action
              ? {
                  ...m,
                  pending_action: {
                    ...m.pending_action,
                    status: 'confirmed',
                    record_id: recordId,
                  },
                }
              : m,
          ),
        );

        addToast({
          type: 'success',
          title: 'Action Confirmed!',
          message: `Booking operation succeeded. Record reference: ${recordId}`,
        });
      } else {
        const isUncertain = result.error?.code === 'OUTCOME_UNCERTAIN' || result.error?.code === 'EXECUTION_UNCERTAIN';
        const failureError = result.error?.message || 'Action execution was rejected by authoritative backend.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.pending_action
              ? {
                  ...m,
                  pending_action: {
                    ...m.pending_action,
                    status: isUncertain ? 'uncertain' : 'failed',
                    error: failureError,
                  },
                }
              : m,
          ),
        );

        addToast({
          type: isUncertain ? 'warning' : 'error',
          title: isUncertain ? 'Outcome Uncertain' : 'Confirmation Failed',
          message: failureError,
        });
      }
    } catch (err: any) {
      const isUncertain = err?.code === 'OUTCOME_UNCERTAIN' || err?.code === 'EXECUTION_UNCERTAIN';
      const errorText = err instanceof AiApiError ? `[${err.code || 'ERROR'}] ${err.message}` : err?.message || 'Failed to confirm action';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.pending_action
            ? {
                ...m,
                pending_action: {
                  ...m.pending_action,
                  status: isUncertain ? 'uncertain' : 'failed',
                  error: errorText,
                },
              }
            : m,
        ),
      );

      addToast({
        type: isUncertain ? 'warning' : 'error',
        title: isUncertain ? 'Outcome Uncertain' : 'Action Failed',
        message: errorText,
      });
    } finally {
      setConfirmingActionId(null);
    }
  };

  // Decline pending action
  const handleDeclinePendingAction = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pending_action
          ? {
              ...m,
              pending_action: {
                ...m.pending_action,
                status: 'declined',
              },
            }
          : m,
      ),
    );
    addToast({
      type: 'info',
      title: 'Action Declined',
      message: 'You have cancelled the proposed booking action.',
    });
  };

  return (
    <div className="space-y-8">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <span className="text-xs uppercase font-bold tracking-[0.2em] text-[#E11D48] block mb-1">
            CLASS RESERVATION SYSTEM
          </span>
          <h1 className="font-serif text-3xl font-bold text-slate-900">
            {viewMode === 'catalogue' ? 'Book Studio Practice' : 'Member AI Booking Assistant'}
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            {viewMode === 'catalogue'
              ? `Select an upcoming studio session. Active Pass: ${activeMembership?.planName || 'Standard'} (${activeMembership?.remainingCredits ?? 0} credits remaining).`
              : `Inquire about real-time availability, check plan entitlements, and reserve classes using conversational natural language.`}
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setViewMode('catalogue')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition ${
              viewMode === 'catalogue'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Class Timetable
          </button>
          <button
            type="button"
            onClick={() => setViewMode('assistant')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition ${
              viewMode === 'assistant'
                ? 'bg-[#E11D48] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            AI Booking Assistant
            <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold bg-white/20 rounded-full uppercase tracking-wider">
              Live
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW MODE 1: CATALOGUE VIEW (Manual Schedule Grid) */}
      {/* ========================================================================= */}
      {viewMode === 'catalogue' && (
        <div className="space-y-6">
          {/* Natural Language Prompt Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white text-[#E11D48] flex items-center justify-center shadow-xs shrink-0">
                <SparklesIcon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Prefer conversational booking?</h4>
                <p className="text-[11px] text-slate-600">
                  Ask our AI Assistant to check slots or book classes instantly: &ldquo;What morning yoga can I book this week?&rdquo;
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewMode('assistant')}
              className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold tracking-wide transition shadow-xs whitespace-nowrap"
            >
              Open AI Booking Assistant &rarr;
            </button>
          </div>

          {/* Search & Category Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {['All', 'Yoga', 'Pilates', 'Sound', 'Dance'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition ${
                    selectedCategory === cat
                      ? 'bg-[#E11D48] text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search class or guide..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-full border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
              />
            </div>
          </div>

          {loadError && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <strong>Notice:</strong> {loadError}
            </div>
          )}

          {/* Sessions Grid */}
          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-500 text-xs">
              Loading studio classes from gateway...
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <p className="font-serif text-lg font-bold text-slate-800">No scheduled classes available</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                There are currently no open classes scheduled in this sanctuary category. Please check back soon or consult the front desk concierge.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
                      <Image src={session.imageUrl} alt={session.classTitle} fill className="object-cover" />
                    </div>
                    <div className="space-y-1">
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-[#E11D48] text-[10px] font-bold uppercase">
                        {session.category}
                      </span>
                      <h3 className="font-serif text-lg font-bold text-slate-900">{session.classTitle}</h3>
                      <div className="text-xs text-slate-500 space-y-0.5">
                        <p className="font-medium text-slate-800 flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5 text-[#E11D48]" />
                          {session.date} &bull; {session.time}
                        </p>
                        <p className="text-[11px] text-slate-400">Guide: {session.instructor} &bull; {session.location}</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      {session.spotsLeft > 0 ? (
                        <span className="text-xs font-bold text-teal-800 block">{session.spotsLeft} spots open</span>
                      ) : (
                        <span className="text-xs font-bold text-rose-600 block">Class Full (Waitlist Only)</span>
                      )}
                      <span className="text-[11px] text-slate-400">1 Credit or {formatInr(session.price)} drop-in</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setBookingSession(session)}
                      className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold border transition ${
                        session.spotsLeft > 0
                          ? 'text-[#E11D48] border-[#E11D48] hover:bg-[#E11D48] hover:text-white'
                          : 'text-rose-700 border-rose-300 bg-rose-50 hover:bg-rose-100'
                      }`}
                    >
                      {session.spotsLeft > 0 ? 'Book Session' : 'Join Waitlist'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Booking Confirmation Modal */}
          {bookingSession && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-center space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#E11D48]">
                    CONFIRM RESERVATION
                  </span>
                  <h3 className="font-serif text-2xl font-bold text-slate-900">
                    {bookingSession.spotsLeft > 0 ? 'Reserve Your Practice Spot' : 'Join Session Waitlist'}
                  </h3>
                </div>

                <div className="p-4 rounded-2xl bg-[#FCFAF8] border border-slate-200/80 space-y-3 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-500">Class:</span>
                    <span className="text-slate-900 font-serif text-sm">{bookingSession.classTitle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Schedule:</span>
                    <span className="text-slate-800 font-medium">{bookingSession.date} ({bookingSession.time})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Guide &amp; Venue:</span>
                    <span className="text-slate-800">{bookingSession.instructor} &bull; {bookingSession.location}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200/60 pt-2 font-bold">
                    <span className="text-slate-600">Payment method:</span>
                    <span className="text-teal-800">Included in Unlimited Pass (1 Credit)</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setBookingSession(null)}
                    className="w-1/2 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBooking}
                    className="w-1/2 py-3.5 bg-[#E11D48] text-white font-bold text-xs uppercase tracking-widest hover:bg-[#BE123C] transition shadow-md"
                  >
                    Confirm Booking
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirmed Booking Success Modal */}
          {confirmedBooking && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-150">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircleIcon className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-emerald-700">
                    {confirmedBooking.isWaitlist ? 'WAITLIST POSITION CONFIRMED' : 'RESERVATION SUCCESSFUL'}
                  </span>
                  <h3 className="font-serif text-2xl font-bold text-slate-900 mt-1">
                    {confirmedBooking.isWaitlist ? 'You are on the Waitlist' : 'Spot Reserved!'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Ref: <strong className="font-mono text-slate-900">{confirmedBooking.bookingRef}</strong>
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 text-xs text-slate-700 space-y-1">
                  <p className="font-semibold text-slate-900">{confirmedBooking.session.classTitle}</p>
                  <p>{confirmedBooking.session.date} &bull; {confirmedBooking.session.time}</p>
                  <p className="text-slate-500">{confirmedBooking.session.location}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    href="/member/check-in"
                    onClick={() => setConfirmedBooking(null)}
                    className="w-full py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs uppercase tracking-wider transition shadow-sm"
                  >
                    View Digital QR Pass
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirmedBooking(null)}
                    className="w-full py-2.5 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 2: AI BOOKING ASSISTANT (Natural-Language Booking) */}
      {/* ========================================================================= */}
      {viewMode === 'assistant' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[700px] overflow-hidden">
          {/* Assistant Sub-header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#E11D48] text-white flex items-center justify-center shadow-xs">
                <BotIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Booking Concierge</h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] text-emerald-700 font-semibold">Authoritative ERP Live</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Logged in as {user?.name || 'Member'} &bull; Plan:{' '}
                  <strong className="text-slate-700">{activeMembership?.planName || 'Active Membership'}</strong> (
                  {activeMembership?.remainingCredits ?? 0} credits)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSessionId(null);
                setMessages([]);
                initAssistantSession();
              }}
              title="Reset Conversation"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition"
            >
              <RefreshCwIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-4 py-2.5 bg-rose-50/40 border-b border-rose-100/60 flex items-center gap-2 overflow-x-auto scrollbar-none">
            <span className="text-[10px] uppercase font-bold text-[#E11D48] tracking-wider shrink-0 flex items-center gap-1">
              <SparklesIcon className="w-3 h-3" /> Quick Prompts:
            </span>
            {[
              'Check my remaining plan credits',
              'What morning classes can I book this week?',
              'Check slot availability for Power Flow Yoga',
              'Book a spot in HIIT Conditioning for tomorrow',
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSendMessage(prompt)}
                disabled={isThinking}
                className="text-[11px] bg-white border border-rose-200/80 hover:border-rose-400 text-slate-700 hover:text-[#E11D48] px-3 py-1 rounded-full whitespace-nowrap shadow-2xs transition"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 text-slate-500">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 text-[#E11D48] flex items-center justify-center border border-rose-100">
                  <SparklesIcon className="w-7 h-7" />
                </div>
                <div className="max-w-md space-y-1">
                  <h4 className="font-serif text-lg font-bold text-slate-900">
                    Welcome to Natural-Language Booking
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    You can ask about upcoming sessions, verify if your plan includes them, check remaining seats,
                    or request a reservation. When you ask to book or cancel, the assistant will prepare a secure
                    action proposal for your one-click confirmation.
                  </p>
                </div>
              </div>
            ) : null}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-2xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : msg.role === 'system'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-[#E11D48] text-white shadow-xs'
                  }`}
                >
                  {msg.role === 'user' ? <UserIcon className="w-4 h-4" /> : <BotIcon className="w-4 h-4" />}
                </div>

                {/* Message Bubble & Proposal Card */}
                <div className="space-y-3 flex-1">
                  <div
                    className={`p-4 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-slate-900 text-white rounded-tr-xs'
                        : msg.role === 'system'
                        ? 'bg-amber-50 border border-amber-200 text-amber-900 rounded-tl-xs'
                        : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-xs'
                    }`}
                  >
                    <div className="prose prose-xs max-w-none prose-slate">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>

                    {/* Tools Used Pills */}
                    {msg.tools_used && msg.tools_used.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Verified via:</span>
                        {msg.tools_used.map((t, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium ${
                              t.status === 'success'
                                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Two-Phase Booking Proposal Card */}
                  {msg.pending_action && (
                    <div className="p-5 rounded-2xl bg-white border-2 border-rose-200 shadow-md space-y-4 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-[#E11D48] text-[10px] font-bold uppercase tracking-wider">
                            {msg.pending_action.tool === 'createBooking' ? 'RESERVATION PROPOSAL' : 'CANCELLATION PROPOSAL'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            ID: {msg.pending_action.id.slice(0, 8)}...
                          </span>
                        </div>
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            msg.pending_action.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : msg.pending_action.status === 'declined'
                              ? 'bg-slate-100 text-slate-600'
                              : msg.pending_action.status === 'failed'
                              ? 'bg-rose-100 text-rose-800'
                              : msg.pending_action.status === 'uncertain'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-amber-100 text-amber-800 animate-pulse'
                          }`}
                        >
                          {msg.pending_action.status === 'confirmed'
                            ? 'CONFIRMED'
                            : msg.pending_action.status === 'declined'
                            ? 'DECLINED'
                            : msg.pending_action.status === 'failed'
                            ? 'FAILED'
                            : msg.pending_action.status === 'uncertain'
                            ? 'UNCERTAIN'
                            : 'ACTION PROPOSED'}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-serif font-bold text-slate-900">
                          {msg.pending_action.summary}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Requires explicit user confirmation before executing on the authoritative backend.
                        </p>
                      </div>

                      {/* Arguments Preview */}
                      {msg.pending_action.arguments_preview && (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-[11px] font-mono">
                          {Object.entries(msg.pending_action.arguments_preview).map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                              <span className="text-slate-500">{k}:</span>
                              <span className="text-slate-900 font-semibold">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Interactive Confirmation Outcome or Action Buttons */}
                      {msg.pending_action.status === 'proposed' && (
                        <div className="flex items-center gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleConfirmPendingAction(
                                msg.id,
                                msg.pending_action!.id,
                                msg.pending_action!.confirm_token,
                              )
                            }
                            disabled={confirmingActionId === msg.pending_action.id}
                            className="flex-1 py-2.5 px-4 bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {confirmingActionId === msg.pending_action.id ? (
                              <>
                                <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                                Confirming via Gateway...
                              </>
                            ) : (
                              <>
                                <CheckIcon className="w-3.5 h-3.5" />
                                Confirm Booking
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeclinePendingAction(msg.id)}
                            disabled={confirmingActionId === msg.pending_action.id}
                            className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition"
                          >
                            Decline
                          </button>
                        </div>
                      )}

                      {msg.pending_action.status === 'confirmed' && (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <CheckCircle2Icon className="w-4 h-4 text-emerald-600" />
                            <span>
                              Reservation successfully recorded in ERP! Ref:{' '}
                              <strong>{msg.pending_action.record_id}</strong>
                            </span>
                          </div>
                          <Link
                            href="/member/check-in"
                            className="text-[11px] font-bold text-emerald-700 hover:underline uppercase tracking-wide"
                          >
                            Digital Pass &rarr;
                          </Link>
                        </div>
                      )}

                      {msg.pending_action.status === 'failed' && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 text-xs">
                          <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>{msg.pending_action.error || 'Execution failed.'}</span>
                        </div>
                      )}

                      {msg.pending_action.status === 'uncertain' && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2 text-xs">
                          <AlertCircleIcon className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{msg.pending_action.error || 'Action outcome is uncertain. Check your bookings before retrying to prevent duplicate reservations.'}</span>
                        </div>
                      )}

                      {msg.pending_action.status === 'declined' && (
                        <div className="p-3 rounded-xl bg-slate-100 text-slate-600 flex items-center gap-2 text-xs">
                          <XCircleIcon className="w-4 h-4 text-slate-400" />
                          <span>Action proposal declined by member. No reservation was made.</span>
                        </div>
                      )}
                    </div>
                  )}

                  <span className="text-[10px] text-slate-400 block px-1">{msg.timestamp}</span>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex gap-3 max-w-2xl">
                <div className="w-8 h-8 rounded-xl bg-[#E11D48] text-white flex items-center justify-center text-xs shrink-0 shadow-xs">
                  <BotIcon className="w-4 h-4" />
                </div>
                <div className="p-3.5 rounded-2xl rounded-tl-xs bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                  <Loader2Icon className="w-3.5 h-3.5 animate-spin text-[#E11D48]" />
                  <span>Checking studio schedule and plan entitlements...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask to check slots or book a class (e.g. 'Book Power Flow Yoga for tomorrow')..."
              disabled={isThinking}
              className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E11D48] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isThinking}
              className="px-5 py-2.5 bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition shadow-sm disabled:opacity-40 flex items-center gap-1.5"
            >
              {isThinking ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <SendIcon className="w-3.5 h-3.5" />}
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function MemberBookClassPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-xs">Loading studio schedule...</div>}>
      <MemberBookClassContent />
    </Suspense>
  );
}
