'use client';

import React, { useEffect, useCallback } from 'react';
import { XIcon } from './icons';
import { useBodyScrollLock } from './useBodyScrollLock';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnEsc?: boolean;
  closeOnBackdrop?: boolean;
  singleScroll?: boolean;
}

const sizeClasses: Record<'sm' | 'md' | 'lg' | 'xl' | 'full', string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  closeOnEsc = true,
  closeOnBackdrop = true,
  singleScroll = false,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEsc, onClose]
  );

  useBodyScrollLock(isOpen, singleScroll);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown, singleScroll]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 ${singleScroll ? 'overflow-hidden' : 'overflow-y-auto'} animate-fade-in`}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={() => closeOnBackdrop && onClose()}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        className={`relative w-full ${sizeClasses[size]} ${singleScroll ? 'flex max-h-[calc(100dvh-2rem)] flex-col' : ''} bg-white dark:bg-studio-900 border border-sand-200 dark:border-studio-700/80 rounded-2xl shadow-modal overflow-hidden z-10 animate-slide-up`}
      >
        {/* Header */}
        {(title || description) && (
          <div className={`flex ${singleScroll ? 'shrink-0' : ''} items-start justify-between p-5 sm:p-6 border-b border-sand-100 dark:border-studio-800`}>
            <div>
              {title && (
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-sand-900 dark:text-white">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-1 text-xs sm:text-sm text-sand-500 dark:text-sand-400">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="text-sand-400 hover:text-sand-700 dark:hover:text-sand-200 p-1.5 rounded-lg hover:bg-sand-100 dark:hover:bg-studio-800 transition-colors"
            >
              <XIcon size="sm" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className={`p-5 sm:p-6 ${singleScroll ? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-[calc(85vh-140px)] overflow-y-auto'}`}>{children}</div>

        {/* Footer */}
        {footer && (
          <div className={`${singleScroll ? 'shrink-0' : ''} p-4 sm:p-6 pt-3 border-t border-sand-100 dark:border-studio-800 flex items-center justify-end gap-3 bg-sand-50/50 dark:bg-studio-950/40`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
