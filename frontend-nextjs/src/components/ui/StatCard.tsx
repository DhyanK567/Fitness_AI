import React from 'react';
import { TrendingUpIcon, TrendingDownIcon } from './icons';

export interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: string;
    trend: 'up' | 'down' | 'neutral';
    label?: string;
  };
  icon?: React.ReactNode;
  variant?: 'default' | 'luxury' | 'primary';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  icon,
  variant = 'default',
  className = '',
}) => {
  const isLuxury = variant === 'luxury';
  const isPrimary = variant === 'primary';

  return (
    <div
      className={`p-5 sm:p-6 rounded-2xl border transition-all duration-200 ${
        isLuxury
          ? 'bg-gradient-to-br from-studio-900 to-studio-950 border-accent-500/30 text-white shadow-elevated'
          : isPrimary
          ? 'bg-primary-950/40 border-primary-500/30 text-white shadow-elevated'
          : 'bg-white dark:bg-studio-850 border-sand-200 dark:border-studio-700/80 shadow-card'
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-wider ${
              isLuxury
                ? 'text-accent-400'
                : isPrimary
                ? 'text-primary-400'
                : 'text-sand-500 dark:text-sand-400'
            }`}
          >
            {title}
          </p>
          <h4
            className={`text-2xl sm:text-3xl font-extrabold mt-1.5 tracking-tight ${
              isLuxury || isPrimary ? 'text-white' : 'text-sand-900 dark:text-white'
            }`}
          >
            {value}
          </h4>
        </div>
        {icon && (
          <div
            className={`p-3 rounded-xl flex items-center justify-center shrink-0 ${
              isLuxury
                ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20'
                : isPrimary
                ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                : 'bg-sand-100 dark:bg-studio-800 text-primary-600 dark:text-primary-400 border border-sand-200 dark:border-studio-700'
            }`}
          >
            {icon}
          </div>
        )}
      </div>

      {change && (
        <div className="mt-3.5 flex items-center gap-1.5 text-xs font-medium">
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold ${
              change.trend === 'up'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                : change.trend === 'down'
                ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400'
                : 'bg-sand-100 dark:bg-studio-800 text-sand-600 dark:text-sand-400'
            }`}
          >
            {change.trend === 'up' && <TrendingUpIcon size="xs" />}
            {change.trend === 'down' && <TrendingDownIcon size="xs" />}
            {change.value}
          </span>
          {change.label && (
            <span className="text-sand-500 dark:text-sand-400">{change.label}</span>
          )}
        </div>
      )}
    </div>
  );
};
