'use client';

import React, { forwardRef, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  success?: boolean;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      success,
      prefixIcon,
      suffixIcon,
      className = '',
      containerClassName = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const hasError = Boolean(error);

    return (
      <div className={`w-full ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-sand-700 dark:text-sand-300 mb-1.5"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {prefixIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-sand-400 dark:text-studio-700">
              {prefixIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`w-full h-10 rounded-lg text-sm transition-all duration-150 bg-white dark:bg-studio-850 text-sand-900 dark:text-sand-100 placeholder:text-sand-400 dark:placeholder:text-sand-600 border ${
              prefixIcon ? 'pl-9' : 'pl-3.5'
            } ${suffixIcon ? 'pr-9' : 'pr-3.5'} ${
              hasError
                ? 'border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-500/20'
                : success
                ? 'border-emerald-500 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                : 'border-sand-300 dark:border-studio-700 hover:border-sand-400 dark:hover:border-studio-600 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20'
            } focus:outline-none disabled:bg-sand-100 dark:disabled:bg-studio-900 disabled:text-sand-400 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          {suffixIcon && (
            <div className="absolute right-3 flex items-center pointer-events-none text-sand-400 dark:text-studio-700">
              {suffixIcon}
            </div>
          )}
        </div>
        {hasError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
        {!hasError && helperText && (
          <p className="mt-1.5 text-xs text-sand-500 dark:text-sand-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  characterCount?: number;
  maxCharacters?: number;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helperText,
      error,
      characterCount,
      maxCharacters,
      className = '',
      containerClassName = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const hasError = Boolean(error);

    return (
      <div className={`w-full ${containerClassName}`}>
        {label && (
          <div className="flex justify-between items-center mb-1.5">
            <label
              htmlFor={textareaId}
              className="block text-xs font-semibold uppercase tracking-wider text-sand-700 dark:text-sand-300"
            >
              {label}
              {props.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {maxCharacters && (
              <span className="text-xs text-sand-400 dark:text-sand-500">
                {characterCount ?? 0}/{maxCharacters}
              </span>
            )}
          </div>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          className={`w-full p-3 rounded-lg text-sm transition-all duration-150 bg-white dark:bg-studio-850 text-sand-900 dark:text-sand-100 placeholder:text-sand-400 dark:placeholder:text-sand-600 border ${
            hasError
              ? 'border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-500/20'
              : 'border-sand-300 dark:border-studio-700 hover:border-sand-400 dark:hover:border-studio-600 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20'
          } focus:outline-none disabled:bg-sand-100 dark:disabled:bg-studio-900 disabled:text-sand-400 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        {hasError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
        {!hasError && helperText && (
          <p className="mt-1.5 text-xs text-sand-500 dark:text-sand-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      error,
      options,
      placeholder,
      className = '',
      containerClassName = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const hasError = Boolean(error);

    return (
      <div className={`w-full ${containerClassName}`}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold uppercase tracking-wider text-sand-700 dark:text-sand-300 mb-1.5"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={`w-full h-10 pl-3.5 pr-10 rounded-lg text-sm appearance-none transition-all duration-150 bg-white dark:bg-studio-850 text-sand-900 dark:text-sand-100 border ${
              hasError
                ? 'border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-500/20'
                : 'border-sand-300 dark:border-studio-700 hover:border-sand-400 dark:hover:border-studio-600 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20'
            } focus:outline-none disabled:bg-sand-100 dark:disabled:bg-studio-900 disabled:text-sand-400 disabled:cursor-not-allowed cursor-pointer ${className}`}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-sand-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {hasError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
        {!hasError && helperText && (
          <p className="mt-1.5 text-xs text-sand-500 dark:text-sand-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  sublabel?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, sublabel, indeterminate, className = '', id, disabled, checked, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;

    return (
      <label
        htmlFor={checkboxId}
        className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <input
          ref={ref}
          type="checkbox"
          id={checkboxId}
          checked={checked}
          disabled={disabled}
          className={`h-4 w-4 mt-0.5 rounded border-sand-300 dark:border-studio-700 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 transition-colors cursor-pointer disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        {(label || sublabel) && (
          <div className="flex flex-col text-sm">
            {label && <span className="font-medium text-sand-900 dark:text-sand-100">{label}</span>}
            {sublabel && <span className="text-xs text-sand-500 dark:text-sand-400">{sublabel}</span>}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  id,
}) => {
  const generatedId = useId();
  const switchId = id || generatedId;

  const toggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const isSmall = size === 'sm';

  return (
    <div className={`inline-flex items-center justify-between gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      {(label || description) && (
        <div className="flex flex-col cursor-pointer" onClick={toggle}>
          {label && <span className="text-sm font-medium text-sand-900 dark:text-sand-100">{label}</span>}
          {description && <span className="text-xs text-sand-500 dark:text-sand-400">{description}</span>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        disabled={disabled}
        onClick={toggle}
        className={`relative inline-flex shrink-0 transition-colors duration-200 ease-in-out rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 ${
          isSmall ? 'h-5 w-9' : 'h-6 w-11'
        } ${checked ? 'bg-primary-600' : 'bg-sand-300 dark:bg-studio-700'}`}
      >
        <span
          className={`pointer-events-none inline-block rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
            isSmall ? 'h-4 w-4 mt-0.5' : 'h-5 w-5 mt-0.5'
          } ${
            checked
              ? isSmall
                ? 'translate-x-4 ml-0.5'
                : 'translate-x-5 ml-0.5'
              : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
};
