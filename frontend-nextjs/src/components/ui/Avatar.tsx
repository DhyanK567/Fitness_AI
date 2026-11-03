import React from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = 'online' | 'busy' | 'offline';

export interface AvatarProps {
  src?: string;
  name: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
}

const sizeMap: Record<AvatarSize, { container: string; text: string; dot: string }> = {
  xs: { container: 'h-6 w-6', text: 'text-[10px]', dot: 'h-1.5 w-1.5 right-0 bottom-0' },
  sm: { container: 'h-8 w-8', text: 'text-xs', dot: 'h-2 w-2 right-0 bottom-0' },
  md: { container: 'h-10 w-10', text: 'text-sm', dot: 'h-2.5 w-2.5 right-0.5 bottom-0.5' },
  lg: { container: 'h-12 w-12', text: 'text-base', dot: 'h-3 w-3 right-0.5 bottom-0.5' },
  xl: { container: 'h-16 w-16', text: 'text-xl', dot: 'h-3.5 w-3.5 right-1 bottom-1' },
};

const statusColors: Record<AvatarStatus, string> = {
  online: 'bg-emerald-500 ring-2 ring-white dark:ring-studio-900',
  busy: 'bg-amber-500 ring-2 ring-white dark:ring-studio-900',
  offline: 'bg-sand-400 ring-2 ring-white dark:ring-studio-900',
};

function getInitials(name: string): string {
  if (!name) return 'WS';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Generate consistent background color based on name string
function getBgColor(name: string): string {
  const colors = [
    'bg-teal-600 text-white',
    'bg-secondary-600 text-white',
    'bg-accent-600 text-white',
    'bg-emerald-700 text-white',
    'bg-studio-800 text-sand-100',
    'bg-indigo-600 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  status,
  className = '',
}) => {
  const { container, text, dot } = sizeMap[size];
  const initials = getInitials(name);
  const colorClass = getBgColor(name);

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={`${container} rounded-full object-cover border border-sand-200 dark:border-studio-700`}
        />
      ) : (
        <div
          className={`${container} ${colorClass} rounded-full flex items-center justify-center font-bold tracking-tight select-none border border-black/10`}
        >
          <span className={text}>{initials}</span>
        </div>
      )}
      {status && (
        <span
          className={`absolute rounded-full ${dot} ${statusColors[status]}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
