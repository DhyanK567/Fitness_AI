'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, Loader2Icon } from 'lucide-react';

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (msg: string) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');
  const [height, setHeight] = useState(44); // min height (h-11 = 44px)
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 44), 200);
      setHeight(newHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled || trimmed.length > 2000) return;
    onSend(trimmed);
    setInput('');
    setHeight(44);
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const isTooLong = input.length > 2000;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1 w-full bg-white p-3 border-t border-slate-200 shrink-0"
    >
      <div className="flex gap-2 items-end w-full">
        <label htmlFor="ai-copilot-input" className="sr-only">
          Ask Studio Copilot
        </label>
        <div className="flex-1 relative">
          <textarea
            id="ai-copilot-input"
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            maxLength={2000}
            placeholder="Ask studio questions or request operations (e.g., 'Freeze John Doe membership for 14 days')..."
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 disabled:opacity-50 text-xs sm:text-sm text-slate-800 placeholder-slate-400 bg-white resize-none transition-all min-h-[44px] max-h-[200px]"
            rows={1}
            style={{ height: `${height}px` }}
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || disabled || isTooLong}
          aria-label="Send message to Studio Copilot"
          className="h-10 px-4 flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-semibold shadow-xs shrink-0"
        >
          {disabled ? (
            <Loader2Icon size={16} className="animate-spin" />
          ) : (
            <>
              <span className="hidden sm:inline">Send</span>
              <SendIcon size={14} />
            </>
          )}
        </button>
      </div>
      {isTooLong && (
        <span className="text-[10px] text-rose-600 px-2 font-medium">
          Message exceeds 2000 character limit ({input.length}/2000).
        </span>
      )}
    </form>
  );
}