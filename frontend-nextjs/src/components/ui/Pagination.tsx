'use client';

import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className = '',
}) => {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-sand-500 dark:text-sand-400 py-3 ${className}`}
    >
      <div>
        {typeof totalItems === 'number' && typeof pageSize === 'number' && (
          <span>
            Showing{' '}
            <strong className="text-sand-900 dark:text-white">
              {Math.min((currentPage - 1) * pageSize + 1, totalItems)}
            </strong>{' '}
            to{' '}
            <strong className="text-sand-900 dark:text-white">
              {Math.min(currentPage * pageSize, totalItems)}
            </strong>{' '}
            of <strong className="text-sand-900 dark:text-white">{totalItems}</strong> entries
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => canGoPrev && onPageChange(currentPage - 1)}
          disabled={!canGoPrev}
          aria-label="Previous page"
          className="p-1.5 rounded-lg border border-sand-200 dark:border-studio-700 bg-white dark:bg-studio-850 text-sand-700 dark:text-sand-300 hover:bg-sand-50 dark:hover:bg-studio-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeftIcon size="sm" />
        </button>

        <span className="px-3 py-1 font-semibold text-sand-800 dark:text-sand-200 bg-sand-100 dark:bg-studio-800 rounded-lg">
          Page {currentPage} of {totalPages || 1}
        </span>

        <button
          onClick={() => canGoNext && onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          aria-label="Next page"
          className="p-1.5 rounded-lg border border-sand-200 dark:border-studio-700 bg-white dark:bg-studio-850 text-sand-700 dark:text-sand-300 hover:bg-sand-50 dark:hover:bg-studio-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRightIcon size="sm" />
        </button>
      </div>
    </div>
  );
};
