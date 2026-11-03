'use client';

import React from 'react';
import { SearchIcon, XIcon } from './icons';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  className?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  onClear,
  className = '',
}) => {
  return (
    <div className={`relative flex items-center w-full max-w-sm ${className}`}>
      <div className="absolute left-3 text-sand-400 dark:text-studio-700 pointer-events-none">
        <SearchIcon size="sm" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-9 pr-9 rounded-lg text-sm bg-white dark:bg-studio-850 text-sand-900 dark:text-sand-100 placeholder:text-sand-400 dark:placeholder:text-sand-600 border border-sand-300 dark:border-studio-700 hover:border-sand-400 dark:hover:border-studio-600 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20 focus:outline-none transition-all"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            onClear?.();
          }}
          aria-label="Clear search"
          className="absolute right-2.5 p-1 rounded-md text-sand-400 hover:text-sand-700 dark:hover:text-sand-200 transition-colors"
        >
          <XIcon size="xs" />
        </button>
      )}
    </div>
  );
};
