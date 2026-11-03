'use client';

import React, { useEffect, useCallback } from 'react';
import { XIcon } from './icons';
import { useBodyScrollLock } from './useBodyScrollLock';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  position?: 'right' | 'left' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const positionClasses = {
  right: 'right-0 top-0 bottom-0 animate-slide-left',
  left: 'left-0 top-0 bottom-0 animate-slide-right',
  bottom: 'bottom-0 left-0 right-0 max-h-[90vh] rounded-t-2xl animate-slide-up',
};

const widthClasses = {
  sm: 'max-w-md w-full',
  md: 'max-w-lg w-full',
  lg: 'max-w-2xl w-full',
  xl: 'max-w-3xl w-full',
};

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  position = 'right',
  size = 'md',
  children,
  footer,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden animate-fade-in"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div
        className={`fixed z-10 flex flex-col bg-white dark:bg-studio-900 border-l border-sand-200 dark:border-studio-700/80 shadow-2xl ${
          position === 'bottom' ? positionClasses.bottom : `${positionClasses[position]} ${widthClasses[size]}`
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-sand-100 dark:border-studio-800">
          <div>
            {title && (
              <h3 className="text-lg font-bold tracking-tight text-sand-900 dark:text-white">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-sand-500 dark:text-sand-400">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            className="text-sand-400 hover:text-sand-700 dark:hover:text-sand-200 p-1.5 rounded-lg hover:bg-sand-100 dark:hover:bg-studio-800 transition-colors"
          >
            <XIcon size="sm" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 flex-1 overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-4 sm:p-6 border-t border-sand-100 dark:border-studio-800 flex items-center justify-end gap-3 bg-sand-50/50 dark:bg-studio-950/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
