import React from 'react';

export interface LoadingStateProps {
  label?: string;
  variant?: 'spinner' | 'card' | 'table';
  rows?: number;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading studio data...',
  variant = 'spinner',
  rows = 4,
  className = '',
}) => {
  if (variant === 'spinner') {
    return (
      <div className={`flex flex-col items-center justify-center p-12 text-center ${className}`}>
        <div className="relative">
          <div className="h-10 w-10 rounded-full border-2 border-primary-200 dark:border-primary-900 border-t-primary-600 animate-spin" />
        </div>
        <p className="mt-3.5 text-xs sm:text-sm font-medium text-sand-500 dark:text-sand-400">
          {label}
        </p>
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={`space-y-3 p-4 rounded-xl border border-sand-200 dark:border-studio-800 ${className}`}>
        <div className="h-6 w-1/4 rounded bg-sand-200 dark:bg-studio-800 skeleton-shimmer" />
        <div className="space-y-2 pt-2">
          {[...Array(rows)].map((_, i) => (
            <div key={i} className="h-10 w-full rounded-lg bg-sand-100 dark:bg-studio-900 skeleton-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  // Card Skeleton
  return (
    <div className={`p-6 rounded-2xl border border-sand-200 dark:border-studio-800 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="h-4 w-1/3 rounded bg-sand-200 dark:bg-studio-800 skeleton-shimmer" />
        <div className="h-8 w-8 rounded-full bg-sand-200 dark:bg-studio-800 skeleton-shimmer" />
      </div>
      <div className="h-8 w-1/2 rounded-lg bg-sand-200 dark:bg-studio-800 skeleton-shimmer" />
      <div className="h-3 w-2/3 rounded bg-sand-100 dark:bg-studio-900 skeleton-shimmer" />
    </div>
  );
};
