'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircleIcon, AlertTriangleIcon, InfoIcon, XCircleIcon, XIcon } from './icons';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: Toast = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none p-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 p-4 rounded-xl border border-sand-200 dark:border-studio-700 bg-white dark:bg-studio-900 shadow-modal animate-slide-up transition-all"
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && <CheckCircleIcon size="md" className="text-emerald-500" />}
              {t.type === 'error' && <XCircleIcon size="md" className="text-red-500" />}
              {t.type === 'warning' && <AlertTriangleIcon size="md" className="text-amber-500" />}
              {t.type === 'info' && <InfoIcon size="md" className="text-sky-500" />}
            </div>
            <div className="flex-1 text-xs sm:text-sm">
              {t.title && (
                <h6 className="font-bold text-sand-900 dark:text-white leading-tight">
                  {t.title}
                </h6>
              )}
              <p className="text-sand-600 dark:text-sand-300 mt-0.5 leading-snug">{t.message}</p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              aria-label="Close notification"
              className="text-sand-400 hover:text-sand-700 dark:hover:text-sand-200 p-0.5 rounded transition-colors"
            >
              <XIcon size="xs" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
