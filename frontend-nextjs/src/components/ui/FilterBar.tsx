'use client';

import React from 'react';
import { FilterIcon, XIcon } from './icons';
import { Button } from './Button';

export interface ActiveFilter {
  id: string;
  label: string;
  value: string;
}

export interface FilterBarProps {
  children?: React.ReactNode;
  activeFilters?: ActiveFilter[];
  onRemoveFilter?: (filterId: string) => void;
  onResetFilters?: () => void;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  children,
  activeFilters = [],
  onRemoveFilter,
  onResetFilters,
  className = '',
}) => {
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className={`flex flex-col gap-3 py-2 ${className}`}>
      {/* Top Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">{children}</div>
        {hasActiveFilters && onResetFilters && (
          <Button variant="ghost" size="sm" onClick={onResetFilters} className="text-xs">
            Reset Filters
          </Button>
        )}
      </div>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-sand-100 dark:border-studio-800">
          <div className="flex items-center gap-1.5 text-xs text-sand-500 font-semibold mr-1">
            <FilterIcon size="xs" />
            <span>Active:</span>
          </div>
          {activeFilters.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sand-100 dark:bg-studio-800 text-sand-800 dark:text-sand-200 border border-sand-200 dark:border-studio-700"
            >
              <span className="text-sand-500">{f.label}:</span>
              <strong className="font-semibold">{f.value}</strong>
              {onRemoveFilter && (
                <button
                  type="button"
                  onClick={() => onRemoveFilter(f.id)}
                  aria-label={`Remove filter ${f.label}`}
                  className="hover:text-red-500 transition-colors ml-0.5"
                >
                  <XIcon size="xs" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
