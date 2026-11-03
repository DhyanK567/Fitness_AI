'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Minimize2,
  Bot,
  Dumbbell,
  Calendar,
  Flame,
} from 'lucide-react';

export interface SpotterMessage {
  id: string;
  sender: 'assistant' | 'user' | 'system';
  content: string;
  timestamp: string;
}

export function SpotterAIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<SpotterMessage[]>([
    {
      id: 'spotter_welcome',
      sender: 'assistant',
      content:
        "Hey Coach! 👋 I'm Spotter AI, your training and member coaching assistant. Soon, I'll assist you with programming client workouts, tracking attendance milestones, and analyzing member progress.",
      timestamp: 'Just now',
    },
  ]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: SpotterMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // In preview mode: do NOT simulate fake AI answers.
    // Provide an honest system notification explaining backend integration is underway.
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          sender: 'system',
          content:
            'ℹ️ Spotter AI live backend response engine is currently being wired by our engineering team. Full coaching copilot capabilities will be available shortly.',
          timestamp: 'System',
        },
      ]);
    }, 450);
  }

  function handleQuickPrompt(promptText: string) {
    setInput(promptText);
  }

  return (
    <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 select-none">
      {/* ── EXPANDED CHAT WINDOW ── */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Spotter AI Trainer Assistant"
          className="fixed bottom-20 right-4 sm:bottom-22 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-[390px] max-w-[420px] h-[520px] max-h-[calc(100vh-6.5rem)] flex flex-col rounded-3xl overflow-hidden bg-white dark:bg-studio-900 border border-rose-200/90 dark:border-studio-700 shadow-2xl transition-all duration-200 animate-in fade-in zoom-in-95"
        >
          {/* Header — Professional Red/Rose Accent Theme */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-[#E11D48] to-rose-600 text-white flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center shrink-0 ring-1 ring-white/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif font-bold text-sm text-white tracking-wide leading-tight">
                    Spotter AI
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-semibold text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Trainer Copilot
                  </span>
                </div>
                <p className="text-[11px] text-white/85 leading-none mt-1">
                  Strength, Mobility &amp; Studio Coaching
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Minimize Chat"
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition cursor-pointer"
                title="Minimize Chat"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close Chat"
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition cursor-pointer"
                title="Close Chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs sm:text-sm [scrollbar-width:thin] bg-[#FCFAF8] dark:bg-studio-950/50">
            {/* Status Strip */}
            <div className="rounded-xl px-3.5 py-2 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 text-slate-700 dark:text-slate-300 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-rose-800 dark:text-rose-300">
                <Flame className="w-3.5 h-3.5 text-[#E11D48]" />
                Spotter Assistant Preview
              </span>
              <span className="text-[10px] font-bold text-[#E11D48] dark:text-rose-400 uppercase tracking-wider">
                Engineering
              </span>
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleQuickPrompt('Suggest a 4-week hypertrophy progression')}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs hover:bg-rose-50/80 hover:border-rose-300 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-300 transition"
              >
                <Dumbbell className="w-3 h-3 text-[#E11D48]" />
                Workout Progression
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt('Check-in status for today’s assigned sessions')}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs hover:bg-rose-50/80 hover:border-rose-300 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-300 transition"
              >
                <Calendar className="w-3 h-3 text-[#E11D48]" />
                Today's Roster
              </button>
            </div>

            {/* Rendered Messages */}
            {messages.map((msg) => {
              if (msg.sender === 'system') {
                return (
                  <div
                    key={msg.id}
                    className="text-center my-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-studio-800 text-[11px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-studio-700"
                  >
                    {msg.content}
                  </div>
                );
              }

              const isUser = msg.sender === 'user';

              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 items-end ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-xl bg-[#E11D48] text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <div
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 leading-relaxed shadow-xs text-xs ${
                      isUser
                        ? 'bg-[#E11D48] text-white rounded-br-xs'
                        : 'bg-white dark:bg-studio-800 text-slate-800 dark:text-slate-100 border border-rose-100 dark:border-studio-700 rounded-bl-xs'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={`text-[9px] mt-1 text-right ${
                        isUser ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {msg.timestamp}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Field */}
          <form
            onSubmit={handleSend}
            className="p-3 bg-white dark:bg-studio-900 border-t border-rose-100 dark:border-studio-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Spotter AI about workouts, clients..."
              className="flex-1 rounded-xl border border-rose-200/80 bg-rose-50/20 px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#E11D48] focus:ring-1 focus:ring-[#E11D48] dark:border-studio-700 dark:bg-studio-800 dark:text-white dark:placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-2.5 rounded-xl bg-[#E11D48] hover:bg-rose-700 disabled:opacity-40 text-white shadow-xs transition cursor-pointer disabled:cursor-not-allowed shrink-0"
              aria-label="Send message to Spotter AI"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* ── FLOATING LAUNCHER BUTTON ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Close' : 'Open'} Spotter AI Assistant`}
        className="h-12 px-5 sm:px-6 rounded-full font-bold text-xs sm:text-sm tracking-wide transition-all duration-200 shadow-md shadow-rose-950/20 hover:shadow-lg hover:shadow-rose-950/30 active:scale-98 flex items-center gap-2.5 bg-gradient-to-r from-[#E11D48] to-rose-600 hover:from-rose-700 hover:to-rose-600 text-white cursor-pointer select-none ring-2 ring-white/30 dark:ring-studio-800"
      >
        {isOpen ? (
          <>
            <X className="w-5 h-5 text-white shrink-0" />
            <span>Close</span>
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 text-white shrink-0 animate-pulse" />
            <span>Spotter AI</span>
          </>
        )}
      </button>
    </div>
  );
}
