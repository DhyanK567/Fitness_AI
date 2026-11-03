'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface PopoverProps {
  trigger: React.ReactNode;
  content: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export const Popover: React.FC<PopoverProps> = ({
  trigger,
  content,
  align = 'center',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'left'
      ? 'left-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <div ref={containerRef} className="relative inline-block">
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>

      {isOpen && (
        <div
          className={`absolute z-40 mt-2 p-4 w-72 rounded-2xl bg-white dark:bg-studio-900 border border-sand-200 dark:border-studio-700 shadow-modal animate-slide-up ${alignClass} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
};
