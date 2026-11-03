'use client';

import React from 'react';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
  XCircleIcon,
  XIcon,
} from './icons';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const variantConfig: Record<
  AlertVariant,
  { container: string; icon: React.ReactNode; title: string; text: string }
> = {
  info: {
    container: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/40',
    icon: <InfoIcon size="md" className="text-sky-600 dark:text-sky-400" />,
    title: 'text-sky-900 dark:text-sky-200',
    text: 'text-sky-800 dark:text-sky-300',
  },
  success: {
    container: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40',
    icon: <CheckCircleIcon size="md" className="text-emerald-600 dark:text-emerald-400" />,
    title: 'text-emerald-900 dark:text-emerald-200',
    text: 'text-emerald-800 dark:text-emerald-300',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40',
    icon: <AlertTriangleIcon size="md" className="text-amber-600 dark:text-amber-400" />,
    title: 'text-amber-900 dark:text-amber-200',
    text: 'text-amber-800 dark:text-amber-300',
  },
  danger: {
    container: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/40',
    icon: <XCircleIcon size="md" className="text-red-600 dark:text-red-400" />,
    title: 'text-red-900 dark:text-red-200',
    text: 'text-red-800 dark:text-red-300',
  },
};

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  onDismiss,
  className = '',
}) => {
  const config = variantConfig[variant];

  return (
    <div
      role="alert"
      className={`flex items-start gap-3.5 p-4 rounded-xl border transition-all ${config.container} ${className}`}
    >
      <div className="shrink-0 mt-0.5">{config.icon}</div>
      <div className="flex-1 text-xs sm:text-sm">
        {title && <h5 className={`font-bold mb-0.5 ${config.title}`}>{title}</h5>}
        <div className={`leading-relaxed ${config.text}`}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className="text-sand-400 hover:text-sand-700 dark:hover:text-sand-200 p-1 rounded-md transition-colors"
        >
          <XIcon size="xs" />
        </button>
      )}
    </div>
  );
};
