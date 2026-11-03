'use client';

import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  isLoading?: boolean;
  emptyMessage?: React.ReactNode;
  onRowClick?: (item: T) => void;
  density?: 'compact' | 'normal' | 'relaxed';
  className?: string;
}

const densityPadding = {
  compact: 'py-2 px-3',
  normal: 'py-3.5 px-4',
  relaxed: 'py-4 px-5',
};

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No records found',
  onRowClick,
  density = 'normal',
  className = '',
}: DataTableProps<T>) {
  const pad = densityPadding[density];

  return (
    <div className={`w-full overflow-x-auto rounded-xl border border-sand-200 dark:border-studio-700/80 bg-white dark:bg-studio-850 shadow-sm ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-sand-200 dark:border-studio-700 bg-sand-50/75 dark:bg-studio-900/60">
            {columns.map((col) => {
              const alignClass =
                col.align === 'right'
                  ? 'text-right'
                  : col.align === 'center'
                  ? 'text-center'
                  : 'text-left';
              return (
                <th
                  key={col.key}
                  className={`text-[11px] font-bold uppercase tracking-wider text-sand-500 dark:text-sand-400 select-none ${pad} ${alignClass} ${
                    col.className || ''
                  }`}
                >
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100 dark:divide-studio-800">
          {isLoading && (
            <>
              {[...Array(4)].map((_, i) => (
                <tr key={`skel-${i}`} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={`skel-td-${col.key}`} className={pad}>
                      <div className="h-4 bg-sand-200 dark:bg-studio-700 rounded-md w-3/4 skeleton-shimmer" />
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}

          {!isLoading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-sm text-sand-500 dark:text-sand-400">
                {emptyMessage}
              </td>
            </tr>
          )}

          {!isLoading &&
            data.map((item, index) => {
              const rowKey = keyExtractor(item, index);
              const isClickable = Boolean(onRowClick);

              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick?.(item)}
                  className={`transition-colors text-sm text-sand-900 dark:text-sand-100 ${
                    isClickable
                      ? 'hover:bg-sand-50 dark:hover:bg-studio-800/60 cursor-pointer active:bg-sand-100 dark:active:bg-studio-800'
                      : 'hover:bg-sand-50/40 dark:hover:bg-studio-800/30'
                  }`}
                >
                  {columns.map((col) => {
                    const alignClass =
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';

                    return (
                      <td key={`${rowKey}-${col.key}`} className={`${pad} ${alignClass} ${col.className || ''}`}>
                        {col.render
                          ? col.render(item, index)
                          : ((item as Record<string, unknown>)[col.key] as React.ReactNode) ?? '—'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
