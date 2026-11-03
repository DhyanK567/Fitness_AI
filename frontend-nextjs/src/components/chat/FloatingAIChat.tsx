'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Minimize2,
} from 'lucide-react';

export interface ChatMessage {
  id: string;
  sender: 'assistant' | 'user' | 'system';
  content: string;
  timestamp: string;
}

export interface FloatingAIChatProps {
  /**
   * Chatbot variant:
   * - 'enquiry': Public & Member explore landing pages (Enquiry AI)
   * - 'member': Authenticated member portal dashboard (Ask AI)
   */
  variant?: 'enquiry' | 'member';
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  studioName?: string;
  theme?: 'light' | 'dark' | 'auto';
  /**
   * Integration point for Harish to connect the backend AI endpoint:
   * e.g. POST /api/v1/ai/chat or WebSocket stream
   */
  onSendMessage?: (message: string) => Promise<void> | void;
  /**
   * Whether the live AI backend is connected.
   * When false (default), the UI renders in preview mode with clear "Coming Soon" indicators.
   */
  isBackendConnected?: boolean;
  initialMessages?: ChatMessage[];
  className?: string;
}

/**
 * Message Display List Component
 * Kept separate from launcher so Harish can cleanly swap/augment rendering logic.
 */
export function ChatMessageList({
  messages,
  isBackendConnected,
  variant,
}: {
  messages: ChatMessage[];
  isBackendConnected: boolean;
  variant: 'enquiry' | 'member';
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs sm:text-sm [scrollbar-width:thin]">
      {/* Informational Status Strip */}
      <div className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 flex items-center justify-between text-[11px]">
        <span className="font-medium">AI assistance coming soon</span>
        <span className="text-[10px] font-semibold text-[#E11D48] dark:text-rose-400 uppercase tracking-wider">
          Preview
        </span>
      </div>

      {/* Rendered Messages */}
      {messages.map((msg) => {
        if (msg.sender === 'system') {
          return (
            <div
              key={msg.id}
              className="text-center my-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
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
              <div className="w-7 h-7 rounded-full bg-[#E11D48] text-white flex items-center justify-center shrink-0 shadow-xs">
                <MessageSquare className="w-3.5 h-3.5 text-white" />
              </div>
            )}

            <div
              className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 leading-relaxed shadow-xs ${
                isUser
                  ? 'bg-[#E11D48] text-white rounded-br-xs'
                  : 'bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 rounded-bl-xs'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <div
                className={`text-[9px] mt-1 text-right ${
                  isUser ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        );
      })}

      <div ref={messagesEndRef} />
    </div>
  );
}

/**
 * Chat Input Area Component
 * Kept separate from launcher so Harish can hook in input validation, streaming, or speech input.
 */
export function ChatInputArea({
  onSend,
  isBackendConnected,
  variant,
}: {
  onSend: (message: string) => void;
  isBackendConnected: boolean;
  variant: 'enquiry' | 'member';
}) {
  const [text, setText] = useState('');
  const inputId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Type your message
        </label>
        <input
          id={inputId}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            isBackendConnected
              ? 'Ask anything...'
              : 'Type a question (Preview Mode)...'
          }
          className="flex-1 min-w-0 px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#E11D48]/30 focus:border-[#E11D48] transition"
        />

        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Send message"
          className="h-9 w-9 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white disabled:opacity-40 disabled:cursor-not-allowed transition shadow-xs flex items-center justify-center shrink-0 cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-1">
        <span>Press Enter to send</span>
        <span className="font-medium text-[#E11D48] dark:text-rose-400">
          ● Ready for backend integration
        </span>
      </div>
    </div>
  );
}

/**
 * Main Floating AI Chat Component
 */
export function FloatingAIChat({
  variant = 'enquiry',
  title,
  subtitle,
  welcomeMessage,
  studioName,
  theme = 'auto',
  onSendMessage,
  isBackendConnected = false,
  initialMessages,
  className = '',
}: FloatingAIChatProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Resolved titles and default copy according to variant
  const resolvedTitle =
    title || (variant === 'member' ? 'Ask AI' : 'Enquiry AI');
  const resolvedSubtitle =
    subtitle ||
    (variant === 'member'
      ? 'Your personal studio assistant'
      : 'Your studio assistant');
  const resolvedWelcome =
    welcomeMessage ||
    (variant === 'member'
      ? "Hi! 👋 I'm your studio assistant. Soon, I'll be able to help with your classes, membership, and studio services."
      : 'Hi there! 👋 Welcome to our studio. How can we help you today?');

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialMessages && initialMessages.length > 0) return initialMessages;
    return [
      {
        id: 'msg_welcome',
        sender: 'assistant',
        content: resolvedWelcome,
        timestamp: 'Just now',
      },
    ];
  });

  // Handle incoming message from user
  const handleUserMessage = async (content: string) => {
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      content,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMsg]);

    // If external onSendMessage callback was passed by Harish, invoke it
    if (onSendMessage) {
      try {
        await onSendMessage(content);
      } catch (err) {
        console.error('Error invoking chat backend handler:', err);
      }
    }

    // In preview mode (no backend connected yet):
    // Do NOT simulate fake AI answers. Give an honest system status note.
    if (!isBackendConnected) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `system_${Date.now()}`,
            sender: 'system',
            content:
              'ℹ️ Live AI responses are coming soon. The backend connection is currently being integrated by our engineering team.',
            timestamp: 'System',
          },
        ]);
      }, 400);
    }
  };

  return (
    <div
      className={`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 select-none ${className}`}
    >
      {/* ── EXPANDED CHAT WINDOW ── */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={resolvedTitle}
          className="fixed bottom-20 right-4 sm:bottom-22 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-[380px] max-w-[400px] h-[500px] max-h-[calc(100vh-6.5rem)] flex flex-col rounded-3xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl transition-all duration-200 animate-in fade-in zoom-in-95"
        >
          {/* Header — Solid Brand Red */}
          <div className="px-5 py-4 bg-[#E11D48] text-white flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-white leading-tight">
                    {resolvedTitle}
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-medium text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                    Online
                  </span>
                </div>
                <p className="text-[11px] text-white/80 leading-none mt-1">
                  {resolvedSubtitle}
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

          {/* Chat Message List */}
          <ChatMessageList
            messages={messages}
            isBackendConnected={isBackendConnected}
            variant={variant}
          />

          {/* Input Area */}
          <ChatInputArea
            onSend={handleUserMessage}
            isBackendConnected={isBackendConnected}
            variant={variant}
          />
        </div>
      )}

      {/* ── FLOATING LAUNCHER BUTTON (Consistent Solid Brand Red) ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Close' : 'Open'} ${resolvedTitle}`}
        className="h-12 px-5 sm:px-6 rounded-full font-semibold text-[13px] sm:text-sm tracking-normal transition-all duration-200 shadow-md shadow-rose-950/20 hover:shadow-lg hover:shadow-rose-950/30 active:scale-98 flex items-center gap-2.5 bg-[#E11D48] hover:bg-[#BE123C] text-white cursor-pointer select-none"
      >
        {isOpen ? (
          <>
            <X className="w-5 h-5 text-white shrink-0" />
            <span>Close</span>
          </>
        ) : (
          <>
            <MessageSquare className="w-5 h-5 text-white shrink-0" />
            <span>{resolvedTitle}</span>
          </>
        )}
      </button>
    </div>
  );
}
