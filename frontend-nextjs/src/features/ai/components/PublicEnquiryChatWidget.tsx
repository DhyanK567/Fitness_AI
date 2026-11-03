'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  PublicEnquiryApi,
  PublicEnquiryApiError,
} from '../api/public-enquiry-api';
import {
  EnquiryChatMessage,
  PublicEnquirySessionResponse,
} from '../types/public-enquiry';

interface StoredSession {
  sessionId: string;
  expiresAt: string;
}

const STORAGE_KEY = 'ws_enquiry_session_v1';

export function PublicEnquiryChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  const [messages, setMessages] = useState<EnquiryChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // In-Chat Lead Form State
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadInterest, setLeadInterest] = useState('Studio Membership');
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [leadSuccessMessage, setLeadSuccessMessage] = useState<string | null>(null);
  const [leadErrorMessage, setLeadErrorMessage] = useState<string | null>(null);

  // In-Chat Human Handoff State
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [handoffReason, setHandoffReason] = useState('');
  const [handoffContact, setHandoffContact] = useState('');
  const [isSubmittingHandoff, setIsSubmittingHandoff] = useState(false);
  const [handoffSuccessMessage, setHandoffSuccessMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [messages, isOpen, isMinimized, showLeadForm]);

  // Handle escape key to close widget
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Acquire or create a CAPTCHA token
  const getCaptchaToken = useCallback(async (): Promise<string> => {
    // If a turnstile/hcaptcha provider window object is available, retrieve the token
    if (typeof window !== 'undefined' && (window as any).turnstile?.getResponse) {
      try {
        const token = (window as any).turnstile.getResponse();
        if (token) return token;
      } catch (_) {}
    }
    // Otherwise fallback to client-generated verification token in non-provider mode
    return `cf_client_token_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  // Initiate a new enquiry chat session
  const initSession = useCallback(async (forcedNew = false) => {
    setIsLoading(true);
    setErrorBanner(null);
    setIsExpired(false);

    try {
      // Check existing session from sessionStorage if not forced
      if (!forcedNew && typeof window !== 'undefined') {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const parsed: StoredSession = JSON.parse(stored);
            if (new Date(parsed.expiresAt) > new Date()) {
              setSessionId(parsed.sessionId);
              setExpiresAt(parsed.expiresAt);
              setIsLoading(false);
              return parsed.sessionId;
            }
          } catch (_) {}
        }
      }

      const captchaToken = await getCaptchaToken();
      const pageContext = typeof window !== 'undefined' ? window.location.pathname : '/';
      const sessionData: PublicEnquirySessionResponse = await PublicEnquiryApi.createSession({
        captcha_token: captchaToken,
        page_context: pageContext,
      });

      setSessionId(sessionData.session_id);
      setExpiresAt(sessionData.expires_at);

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            sessionId: sessionData.session_id,
            expiresAt: sessionData.expires_at,
          }),
        );
      }

      // Add server greeting message
      setMessages([
        {
          id: `greet_${Date.now()}`,
          role: 'assistant',
          content: sessionData.greeting || 'Hello! Welcome to our studio. How can I help you today?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      return sessionData.session_id;
    } catch (err: any) {
      const msg =
        err?.code === 'CAPTCHA_FAILED'
          ? 'Security verification failed. Please refresh the page.'
          : err?.code === 'AI_RATE_LIMITED'
          ? 'Session creation limit reached (max 5 per hour). Please try again later.'
          : err?.message || 'Unable to start assistant session. Please try again.';
      setErrorBanner(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getCaptchaToken]);

  // Open widget handler
  const handleOpenWidget = () => {
    setIsOpen(true);
    setIsMinimized(false);
    if (!sessionId) {
      void initSession();
    }
  };

  // Submit visitor message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading || isExpired) return;

    let currentSessionId = sessionId;

    // Check expiry before sending
    if (expiresAt && new Date() > new Date(expiresAt)) {
      setIsExpired(true);
      setErrorBanner('This chat session has expired. Please start a new session.');
      return;
    }

    if (!currentSessionId) {
      currentSessionId = await initSession();
      if (!currentSessionId) return;
    }

    const userText = inputText.trim();
    setInputText('');
    setErrorBanner(null);

    const userMsg: EnquiryChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'visitor',
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const data = await PublicEnquiryApi.postMessage(currentSessionId, { message: userText });

      const assistantMsg: EnquiryChatMessage = {
        id: `ast_${Date.now()}`,
        role: 'assistant',
        content: data.response,
        source_refs: data.source_refs,
        lead_capture_prompt: data.lead_capture_prompt,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (data.lead_capture_prompt && !leadSuccessMessage) {
        setShowLeadForm(true);
      }
    } catch (err: any) {
      if (err instanceof PublicEnquiryApiError) {
        if (err.status === 410 || err.code === 'SESSION_EXPIRED') {
          setIsExpired(true);
          setErrorBanner('Your chat session has expired. Please start a new conversation.');
        } else if (err.status === 429 || err.code === 'AI_RATE_LIMITED') {
          setErrorBanner('Rate limit reached (10 msg/min or 40 msg/session). Please pause for a moment.');
        } else if (err.status === 503 || err.code === 'AI_UNAVAILABLE') {
          setErrorBanner('Concierge assistant is temporarily unavailable. Feel free to use our Enquiry Form.');
        } else {
          setErrorBanner(err.message || 'Error processing your message. Please try again.');
        }
      } else {
        setErrorBanner(err?.message || 'Network error. Please verify your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Lead from In-Chat Card
  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || isSubmittingLead) return;

    if (!whatsappConsent) {
      setLeadErrorMessage('Explicit WhatsApp communication consent is required.');
      return;
    }

    setIsSubmittingLead(true);
    setLeadErrorMessage(null);

    try {
      const res = await PublicEnquiryApi.submitLead(sessionId, {
        name: leadName.trim(),
        phone: leadPhone.trim(),
        email: leadEmail.trim() || undefined,
        interest: leadInterest,
        consent: {
          whatsapp: true,
        },
      });

      setLeadSuccessMessage(
        res.message || 'Thank you! A studio representative will connect with you on WhatsApp shortly.',
      );
      setShowLeadForm(false);

      // Add acknowledgment message in chat
      setMessages((prev) => [
        ...prev,
        {
          id: `lead_ack_${Date.now()}`,
          role: 'system',
          content: `✅ Lead registered for ${leadName}. We will contact you at ${leadPhone} via WhatsApp.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      if (err.status === 422 || err.code === 'CONSENT_REQUIRED') {
        setLeadErrorMessage('Explicit consent for WhatsApp communication is strictly required.');
      } else if (err.status === 429) {
        setLeadErrorMessage('Submission limit reached (3 leads per hour). Please try again later.');
      } else {
        setLeadErrorMessage(err?.message || 'Could not register lead. Please try again.');
      }
    } finally {
      setIsSubmittingLead(false);
    }
  };

  // Request Human Handoff / Front Desk Escalation
  const handleRequestHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || isSubmittingHandoff) return;

    setIsSubmittingHandoff(true);
    setErrorBanner(null);

    try {
      const res = await PublicEnquiryApi.requestHandoff(sessionId, {
        reason: handoffReason.trim() || 'Visitor requested front desk human handoff',
        contact: handoffContact.trim() || undefined,
      });

      setHandoffSuccessMessage(
        res.message || 'Your inquiry has been escalated to our front desk team.',
      );
      setShowHandoffModal(false);

      setMessages((prev) => [
        ...prev,
        {
          id: `handoff_ack_${Date.now()}`,
          role: 'system',
          content: `🛎️ Front Desk Escalation: A studio concierge has been notified and will assist you shortly.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      if (err.status === 429) {
        setErrorBanner('Handoff limit reached for this session (maximum 3 requests).');
      } else {
        setErrorBanner(err?.message || 'Failed to request human handoff. Please try again.');
      }
    } finally {
      setIsSubmittingHandoff(false);
    }
  };

  return (
    <>
      {/* Floating Widget Trigger Button */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
          <button
            id="public-enquiry-widget-trigger"
            type="button"
            onClick={handleOpenWidget}
            aria-label="Open Studio Concierge Chat"
            aria-expanded={false}
            className="group flex items-center gap-2.5 rounded-full bg-slate-900 dark:bg-teal-700 text-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 border border-slate-700/50 dark:border-teal-500/30"
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
            </span>
            <span className="font-medium text-xs sm:text-sm tracking-wide">
              Ask Concierge
            </span>
            <svg
              className="w-4 h-4 text-slate-300 group-hover:text-white transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Chat Window Panel */}
      {isOpen && (
        <div
          id="public-enquiry-chat-window"
          role="dialog"
          aria-label="Studio Concierge Chat Assistant"
          className={`fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 w-[380px] sm:w-[420px] max-w-[calc(100vw-2rem)] rounded-3xl flex flex-col shadow-2xl overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md transition-all duration-300 ${
            isMinimized ? 'h-16' : 'h-[580px] max-h-[calc(100vh-4rem)]'
          }`}
        >
          {/* Top Brand Accent Line */}
          <div className="h-1.5 w-full bg-gradient-to-r from-teal-700 via-rose-600 to-slate-900" />

          {/* Header */}
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-teal-800 flex items-center justify-center font-bold text-xs text-teal-200">
                  AI
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                  Studio Concierge
                </h2>
                <p className="text-[10px] text-teal-400">
                  AI Assistant · Grounded Answers
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Human Handoff Trigger Button */}
              <button
                id="public-enquiry-handoff-button"
                type="button"
                onClick={() => setShowHandoffModal(true)}
                title="Speak to Front Desk / Human Handoff"
                aria-label="Request Front Desk Human Assistance"
                className="p-1.5 rounded-lg text-slate-300 hover:text-rose-300 hover:bg-slate-800 transition text-xs flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="hidden sm:inline text-[10px] font-medium">Front Desk</span>
              </button>

              {/* Minimize/Maximize Button */}
              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                aria-label={isMinimized ? 'Expand Chat' : 'Minimize Chat'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMinimized ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7 7'} />
                </svg>
              </button>

              {/* Close Button */}
              <button
                id="public-enquiry-close-button"
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close Chat"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body when not minimized */}
          {!isMinimized && (
            <>
              {/* Error / Expiry Notification Banner */}
              {errorBanner && (
                <div
                  id="public-enquiry-error-banner"
                  role="alert"
                  className="px-4 py-2 bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between"
                >
                  <span className="truncate pr-2">{errorBanner}</span>
                  {isExpired ? (
                    <button
                      id="public-enquiry-new-session"
                      type="button"
                      onClick={() => void initSession(true)}
                      className="font-bold underline text-[11px] hover:text-rose-900 shrink-0"
                    >
                      New Chat
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setErrorBanner(null)}
                      className="text-rose-500 hover:text-rose-800 text-sm leading-none"
                    >
                      &times;
                    </button>
                  )}
                </div>
              )}

              {/* Human Handoff Modal / Sheet Overlay */}
              {showHandoffModal && (
                <div
                  id="public-enquiry-handoff-modal"
                  className="p-4 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 animate-in fade-in duration-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <span>🛎️</span> Connect with Studio Staff
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowHandoffModal(false)}
                      className="text-slate-400 hover:text-slate-600 text-sm"
                    >
                      &times;
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-3">
                    Need personalized assistance? Our front desk team will follow up directly.
                  </p>
                  <form onSubmit={handleRequestHandoff} className="space-y-2">
                    <input
                      id="public-enquiry-handoff-contact"
                      type="text"
                      placeholder="Your Phone Number / WhatsApp"
                      value={handoffContact}
                      onChange={(e) => setHandoffContact(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    />
                    <input
                      id="public-enquiry-handoff-reason"
                      type="text"
                      placeholder="Topic (e.g. Corporate rates, Personal trainer availability)"
                      value={handoffReason}
                      onChange={(e) => setHandoffReason(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    />
                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setShowHandoffModal(false)}
                        className="text-xs px-3 py-1 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        id="public-enquiry-handoff-submit"
                        type="submit"
                        disabled={isSubmittingHandoff}
                        className="text-xs px-3 py-1 bg-rose-600 text-white font-semibold rounded hover:bg-rose-700 disabled:opacity-50"
                      >
                        {isSubmittingHandoff ? 'Escalating...' : 'Notify Front Desk'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Messages Container */}
              <div
                id="public-enquiry-messages"
                className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50 dark:bg-slate-950/40 text-xs"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'visitor' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-xs leading-relaxed ${
                        msg.role === 'visitor'
                          ? 'bg-rose-600 text-white rounded-br-xs'
                          : msg.role === 'system'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {/* Grounded Source References Pills */}
                      {msg.source_refs && msg.source_refs.length > 0 && (
                        <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-1 items-center">
                          <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">
                            Verified Source:
                          </span>
                          {msg.source_refs.map((ref) => (
                            <span
                              key={ref}
                              className="inline-block px-1.5 py-0.5 rounded-sm bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 text-[10px] font-medium"
                            >
                              {ref === 'classes'
                                ? 'Public Classes'
                                : ref === 'events'
                                ? 'Events & Workshops'
                                : ref === 'plans'
                                ? 'Membership Plans'
                                : ref === 'faq'
                                ? 'Studio Knowledge Base'
                                : ref}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1">
                      {msg.timestamp}
                    </span>
                  </div>
                ))}

                {/* Assistant Loading Dots */}
                {isLoading && (
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 rounded-2xl w-20 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce" />
                  </div>
                )}

                {/* In-Chat Lead Capture Form Card */}
                {showLeadForm && !leadSuccessMessage && (
                  <div
                    id="public-enquiry-lead-card"
                    className="mt-3 p-3.5 bg-white dark:bg-slate-800 rounded-2xl border-2 border-rose-200 dark:border-rose-900 shadow-md space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <span>✨</span> Connect with Studio Concierge
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowLeadForm(false)}
                        className="text-slate-400 hover:text-slate-600 text-sm"
                      >
                        &times;
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Share your details to receive trial pass schedules and membership options.
                    </p>

                    {leadErrorMessage && (
                      <p className="text-[10px] text-rose-600 font-semibold">
                        {leadErrorMessage}
                      </p>
                    )}

                    <form onSubmit={handleSubmitLead} className="space-y-2">
                      <input
                        id="public-enquiry-lead-name"
                        type="text"
                        required
                        placeholder="Your Full Name *"
                        value={leadName}
                        onChange={(e) => setLeadName(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                      <input
                        id="public-enquiry-lead-phone"
                        type="tel"
                        required
                        placeholder="Phone Number (e.g. +91 9876543210) *"
                        value={leadPhone}
                        onChange={(e) => setLeadPhone(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                      <input
                        id="public-enquiry-lead-email"
                        type="email"
                        placeholder="Email Address (optional)"
                        value={leadEmail}
                        onChange={(e) => setLeadEmail(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                      <select
                        id="public-enquiry-lead-interest"
                        value={leadInterest}
                        onChange={(e) => setLeadInterest(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      >
                        <option value="Studio Membership">Studio Membership</option>
                        <option value="Trial Class Pass">Trial Class Pass</option>
                        <option value="Yoga & Meditation">Yoga &amp; Meditation</option>
                        <option value="Dance & Zumba">Dance &amp; Zumba</option>
                        <option value="Strength & Fitness">Strength &amp; Fitness</option>
                        <option value="Corporate Wellness">Corporate Wellness</option>
                      </select>

                      {/* Explicit WhatsApp Consent Checkbox (Strict Requirement) */}
                      <label className="flex items-start gap-2 pt-1 cursor-pointer">
                        <input
                          id="public-enquiry-lead-whatsapp-consent"
                          type="checkbox"
                          required
                          checked={whatsappConsent}
                          onChange={(e) => setWhatsappConsent(e.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        />
                        <span className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">
                          I explicitly consent to receiving studio updates, schedules, and trial pass confirmations on WhatsApp. *
                        </span>
                      </label>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowLeadForm(false)}
                          className="text-xs px-3 py-1 rounded text-slate-500 hover:text-slate-700"
                        >
                          Later
                        </button>
                        <button
                          id="public-enquiry-lead-submit"
                          type="submit"
                          disabled={isSubmittingLead || !whatsappConsent}
                          className="text-xs px-3.5 py-1.5 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 disabled:opacity-40 transition shadow-xs"
                        >
                          {isSubmittingLead ? 'Submitting...' : 'Register Details'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Suggestion Pills */}
              <div className="px-3 py-1.5 bg-slate-100/70 dark:bg-slate-900/60 border-t border-slate-200/50 dark:border-slate-800 flex gap-1.5 overflow-x-auto text-[10px] no-scrollbar">
                <button
                  type="button"
                  onClick={() => {
                    setInputText('What classes do you offer?');
                  }}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-400 hover:text-rose-600 transition"
                >
                  Classes offered?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputText('How much do membership plans cost?');
                  }}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-400 hover:text-rose-600 transition"
                >
                  Membership prices?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputText('Any upcoming workshops this month?');
                  }}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-400 hover:text-rose-600 transition"
                >
                  Upcoming workshops?
                </button>
                <button
                  type="button"
                  onClick={() => setShowLeadForm(true)}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold"
                >
                  Book trial pass &rarr;
                </button>
              </div>

              {/* Chat Input Form */}
              <form
                id="public-enquiry-form"
                onSubmit={handleSendMessage}
                className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    id="public-enquiry-input"
                    type="text"
                    maxLength={1000}
                    disabled={isLoading || isExpired}
                    placeholder={
                      isExpired
                        ? 'Session expired. Click New Chat.'
                        : 'Ask about classes, timings, plans, workshops...'
                    }
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 transition disabled:opacity-50"
                  />
                  {inputText.length > 800 && (
                    <span className="absolute right-3 top-2.5 text-[9px] text-slate-400">
                      {1000 - inputText.length}
                    </span>
                  )}
                </div>

                <button
                  id="public-enquiry-send"
                  type="submit"
                  disabled={isLoading || !inputText.trim() || isExpired}
                  aria-label="Send message"
                  className="p-2.5 rounded-full bg-rose-600 text-white hover:bg-rose-700 active:scale-95 transition disabled:opacity-40 disabled:hover:bg-rose-600 shrink-0 shadow-xs"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </form>

              {/* Privacy Footer Notice */}
              <div className="px-4 py-1.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-900 text-center text-[10px] text-slate-400 flex items-center justify-between">
                <span>Answers grounded in studio catalog &amp; FAQ</span>
                <Link href="/enquiry" className="underline hover:text-rose-500">
                  Full Form
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
