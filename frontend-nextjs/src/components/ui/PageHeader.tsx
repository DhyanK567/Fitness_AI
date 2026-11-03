import React from 'react';
import { Breadcrumbs, BreadcrumbItem } from './Breadcrumbs';

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumbs,
  badge,
  actions,
  className = '',
}) => {
  return (
    <div className={`mb-6 sm:mb-8 space-y-2.5 ${className}`}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} className="mb-2" />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-sand-900 dark:text-white tracking-tight">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1 text-xs sm:text-sm text-sand-500 dark:text-sand-400 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
      </div>
    </div>
  );
};

export interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex items-end justify-between gap-4 mb-4 ${className}`}>
      <div>
        <h3 className="text-lg font-bold text-sand-900 dark:text-white tracking-tight">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-sand-500 dark:text-sand-400">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  children,
  className = '',
}) => {
  return (
    <div
      className={`p-6 sm:p-8 rounded-2xl border border-sand-200 dark:border-studio-700/80 bg-white dark:bg-studio-850 shadow-card ${className}`}
    >
      <div className="mb-6 pb-4 border-b border-sand-100 dark:border-studio-800">
        <h4 className="text-base font-bold text-sand-900 dark:text-white">{title}</h4>
        {description && (
          <p className="mt-1 text-xs text-sand-500 dark:text-sand-400">{description}</p>
        )}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
};
