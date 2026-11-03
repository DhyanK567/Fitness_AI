import React from 'react';
import { AlertTriangleIcon, RefreshCwIcon } from '../ui/icons';
import { Button } from '../ui/Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  correlationId?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'We encountered an error while processing your request. Please try again or contact studio support.',
  correlationId,
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 ${className}`}
    >
      <div className="h-14 w-14 rounded-2xl bg-red-100 dark:bg-red-900/50 border border-red-200 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400 mb-4 shadow-sm">
        <AlertTriangleIcon size="lg" />
      </div>
      <h4 className="text-base sm:text-lg font-bold text-red-950 dark:text-red-200 tracking-tight">
        {title}
      </h4>
      <p className="mt-1.5 text-xs sm:text-sm text-red-700/80 dark:text-red-400/80 max-w-md">
        {message}
      </p>

      {correlationId && (
        <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-100/60 dark:bg-red-900/40 text-[11px] font-mono text-red-800 dark:text-red-300">
          <span>Correlation ID:</span>
          <strong>{correlationId}</strong>
        </div>
      )}

      {onRetry && (
        <div className="mt-6">
          <Button variant="danger" size="sm" onClick={onRetry} leftIcon={<RefreshCwIcon size="xs" />}>
            Retry Request
          </Button>
        </div>
      )}
    </div>
  );
};
