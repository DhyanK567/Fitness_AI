import React from 'react';

export type BadgeVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'luxury';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  solid?: boolean;
}

const subtleStyles: Record<BadgeVariant, string> = {
  primary:
    'bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800/40',
  secondary:
    'bg-secondary-50 dark:bg-secondary-950/60 text-secondary-700 dark:text-secondary-300 border-secondary-200 dark:border-secondary-800/40',
  success:
    'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40',
  warning:
    'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40',
  danger:
    'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40',
  neutral:
    'bg-sand-100 dark:bg-studio-800 text-sand-700 dark:text-sand-300 border-sand-200 dark:border-studio-700',
  luxury:
    'bg-amber-500/10 dark:bg-amber-500/15 text-accent-600 dark:text-accent-400 border-accent-500/30',
};

const solidStyles: Record<BadgeVariant, string> = {
  primary: 'bg-primary-600 text-white border-transparent',
  secondary: 'bg-secondary-600 text-white border-transparent',
  success: 'bg-emerald-600 text-white border-transparent',
  warning: 'bg-amber-500 text-white border-transparent',
  danger: 'bg-red-600 text-white border-transparent',
  neutral: 'bg-sand-700 text-white border-transparent',
  luxury: 'bg-gradient-to-r from-amber-600 to-amber-500 text-white border-transparent',
};

const dotColors: Record<BadgeVariant, string> = {
  primary: 'bg-primary-500',
  secondary: 'bg-secondary-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  neutral: 'bg-sand-500',
  luxury: 'bg-accent-400',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[11px] font-medium px-2 py-0.5 rounded-full',
  md: 'text-xs font-semibold px-2.5 py-0.5 rounded-full',
  lg: 'text-xs font-semibold px-3 py-1 rounded-full',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  dot = false,
  solid = false,
  className = '',
  children,
  ...props
}) => {
  const variantClass = solid ? solidStyles[variant] : subtleStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 border leading-tight ${variantClass} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${solid ? 'bg-white' : dotColors[variant]}`}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
};
