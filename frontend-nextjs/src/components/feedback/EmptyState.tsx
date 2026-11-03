import React from 'react';
import { LayersIcon } from '../ui/icons';
import { Button } from '../ui/Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-dashed border-sand-300 dark:border-studio-700 bg-sand-50/50 dark:bg-studio-900/40 ${className}`}
    >
      <div className="h-14 w-14 rounded-2xl bg-primary-50 dark:bg-primary-950/60 border border-primary-200 dark:border-primary-800/40 flex items-center justify-center text-primary-600 dark:text-primary-400 mb-4 shadow-sm">
        {icon || <LayersIcon size="lg" />}
      </div>
      <h4 className="text-base sm:text-lg font-bold text-sand-900 dark:text-white tracking-tight">
        {title}
      </h4>
      {description && (
        <p className="mt-1.5 text-xs sm:text-sm text-sand-500 dark:text-sand-400 max-w-sm">
          {description}
        </p>
      )}
      {(actionLabel || secondaryActionLabel) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actionLabel && onAction && (
            <Button variant="primary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" size="sm" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
