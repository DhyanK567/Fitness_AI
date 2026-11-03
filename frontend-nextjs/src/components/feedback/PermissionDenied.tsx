import React from 'react';
import Link from 'next/link';
import { ShieldIcon, ArrowLeftIcon } from '../ui/icons';
import { Button } from '../ui/Button';

export interface PermissionDeniedProps {
  requiredRole?: string;
  currentRole?: string;
  title?: string;
  message?: string;
  backUrl?: string;
  className?: string;
}

export const PermissionDenied: React.FC<PermissionDeniedProps> = ({
  requiredRole,
  currentRole,
  title = 'Access Restricted',
  message = 'You do not have the required permissions to view this studio resource. This action has been logged in the audit trail.',
  backUrl = '/dashboard',
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-8 sm:p-14 text-center rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 max-w-xl mx-auto my-8 ${className}`}
    >
      <div className="h-16 w-16 rounded-2xl bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 shadow-sm">
        <ShieldIcon size="xl" />
      </div>
      <h3 className="text-xl sm:text-2xl font-extrabold text-sand-950 dark:text-white tracking-tight">
        {title}
      </h3>
      <p className="mt-2 text-xs sm:text-sm text-sand-600 dark:text-sand-400 leading-relaxed max-w-md">
        {message}
      </p>

      {(requiredRole || currentRole) && (
        <div className="mt-4 flex items-center gap-2 text-xs font-mono">
          {requiredRole && (
            <span className="px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
              Required: <strong>{requiredRole}</strong>
            </span>
          )}
          {currentRole && (
            <span className="px-2.5 py-1 rounded bg-sand-200 dark:bg-studio-800 text-sand-800 dark:text-sand-300">
              Your Role: <strong>{currentRole}</strong>
            </span>
          )}
        </div>
      )}

      <div className="mt-8 flex items-center gap-3">
        <Link href={backUrl}>
          <Button variant="primary" size="md" leftIcon={<ArrowLeftIcon size="xs" />}>
            Return to Safety
          </Button>
        </Link>
      </div>
    </div>
  );
};
