import React from 'react';

export type CardVariant = 'default' | 'flat' | 'luxury' | 'interactive';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  glow?: boolean;
}

const cardVariantStyles: Record<CardVariant, string> = {
  default:
    'bg-white dark:bg-studio-850 border border-sand-200 dark:border-studio-700/60 shadow-card hover:shadow-elevated transition-shadow duration-200',
  flat:
    'bg-sand-50 dark:bg-studio-900 border border-sand-200 dark:border-studio-800',
  luxury:
    'bg-gradient-to-b from-studio-900 to-studio-950 border border-accent-500/20 text-white shadow-elevated hover:border-accent-500/40 transition-colors duration-200',
  interactive:
    'bg-white dark:bg-studio-850 border border-sand-200 dark:border-studio-700/60 shadow-card hover:shadow-elevated hover:border-primary-500/40 dark:hover:border-primary-500/40 cursor-pointer transition-all duration-200 active:scale-[0.99]',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  glow = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${cardVariantStyles[variant]} ${
        glow ? 'shadow-glow-teal' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-5 sm:p-6 pb-2 sm:pb-3 flex flex-col space-y-1.5 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <h3
      className={`text-lg sm:text-xl font-bold tracking-tight text-sand-900 dark:text-white ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p className={`text-xs sm:text-sm text-sand-500 dark:text-sand-400 ${className}`} {...props}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-5 sm:p-6 pt-2 sm:pt-3 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`p-5 sm:p-6 pt-0 border-t border-sand-100 dark:border-studio-800/80 flex items-center justify-between mt-auto ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
