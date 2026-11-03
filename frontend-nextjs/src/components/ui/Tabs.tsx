'use client';

import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'underline' | 'pill' | 'segment';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
}) => {
  return (
    <div
      role="tablist"
      className={`flex items-center overflow-x-auto no-scrollbar select-none ${
        variant === 'segment'
          ? 'p-1 bg-sand-100 dark:bg-studio-900 rounded-xl border border-sand-200 dark:border-studio-800'
          : variant === 'pill'
          ? 'gap-2'
          : 'border-b border-sand-200 dark:border-studio-800 gap-6'
      } ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        if (variant === 'segment') {
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={`flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                isActive
                  ? 'bg-white dark:bg-studio-800 text-primary-700 dark:text-primary-300 shadow-sm'
                  : 'text-sand-600 dark:text-sand-400 hover:text-sand-900 dark:hover:text-sand-100'
              }`}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                      : 'bg-sand-200 dark:bg-studio-700 text-sand-700 dark:text-sand-300'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        }

        if (variant === 'pill') {
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                isActive
                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                  : 'bg-white dark:bg-studio-850 text-sand-700 dark:text-sand-300 border-sand-200 dark:border-studio-700 hover:border-sand-300 dark:hover:border-studio-600 hover:bg-sand-50 dark:hover:bg-studio-800'
              }`}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-sand-100 dark:bg-studio-700 text-sand-600 dark:text-sand-300'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        }

        // Default 'underline' variant
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={`relative flex items-center gap-2 py-3 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isActive
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-sand-600 dark:text-sand-400 hover:text-sand-900 dark:hover:text-sand-200'
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-sand-100 dark:bg-studio-800 text-sand-600 dark:text-sand-300 font-bold">
                {tab.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400 rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
};
