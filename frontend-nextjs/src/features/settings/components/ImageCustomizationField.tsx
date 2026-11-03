'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { isValidImageUrl } from '../types/landing-customization.types';

interface ImageCustomizationFieldProps {
  label: string;
  description?: string;
  value: string;
  onChange: (url: string) => void;
  recommendedDimensions: string;
  recommendedAspectRatio: string;
  placeholder?: string;
}

export const ImageCustomizationField: React.FC<ImageCustomizationFieldProps> = ({
  label,
  description,
  value,
  onChange,
  recommendedDimensions,
  recommendedAspectRatio,
  placeholder = 'https://images.unsplash.com/...',
}) => {
  const [imgError, setImgError] = useState(false);
  const isValid = isValidImageUrl(value);
  const hasValue = Boolean(value && value.trim());

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
        <div>
          <label className="text-xs font-semibold text-slate-800 dark:text-slate-100">{label}</label>
          {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5 self-start sm:self-auto">
          <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-800 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/50 dark:text-rose-300">
            {recommendedDimensions}
          </span>
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Ratio: {recommendedAspectRatio}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[140px_1fr] items-start">
        {/* Image Preview Box */}
        <div className="relative aspect-[4/3] w-full sm:w-[140px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
          {hasValue && !imgError && isValid ? (
            <Image
              src={value}
              alt={label}
              fill
              unoptimized
              className="object-cover object-center transition-all duration-300"
              onError={() => setImgError(true)}
              onLoad={() => setImgError(false)}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-slate-400">
              {imgError ? (
                <>
                  <svg className="h-6 w-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 font-medium">Image failed</span>
                </>
              ) : (
                <>
                  <svg className="h-6 w-6 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="mt-1 text-[10px] text-slate-400">No preview</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Input & Validation Details */}
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Image URL</span>
              {hasValue && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setImgError(false);
                  }}
                  className="text-[10px] text-slate-400 hover:text-rose-600"
                >
                  Clear URL
                </button>
              )}
            </div>
            <input
              type="url"
              value={value}
              onChange={(e) => {
                setImgError(false);
                onChange(e.target.value);
              }}
              placeholder={placeholder}
              className={`w-full rounded-lg border px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-800 dark:text-slate-100 ${
                !isValid
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200 dark:border-rose-500'
                  : 'border-slate-300 focus:border-rose-600 focus:ring-rose-100 dark:border-slate-700'
              }`}
            />
          </div>

          {!isValid && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <span>⚠️</span> Please enter a valid URL (starting with http://, https://, or /)
            </p>
          )}

          <div className="rounded-md bg-slate-50 p-2 text-[10px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Phase 2A note:</span> Enter direct hosted image URLs (e.g. Unsplash, Cloudinary, AWS S3). Direct file upload requires external storage integration.
          </div>
        </div>
      </div>
    </div>
  );
};
