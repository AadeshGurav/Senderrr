import type { ReactNode } from 'react';

const variants = {
  success:
    'bg-emerald-50 text-emerald-700 [data-theme="dark"]:bg-emerald-900/20 [data-theme="dark"]:text-emerald-400 border-emerald-200 [data-theme="dark"]:border-emerald-900/30',
  warning:
    'bg-amber-50 text-amber-700 [data-theme="dark"]:bg-amber-900/20 [data-theme="dark"]:text-amber-400 border-amber-200 [data-theme="dark"]:border-amber-900/30',
  error:
    'bg-red-50 text-red-700 [data-theme="dark"]:bg-red-900/20 [data-theme="dark"]:text-red-400 border-red-200 [data-theme="dark"]:border-red-900/30',
  info:
    'bg-blue-50 text-blue-700 [data-theme="dark"]:bg-blue-900/20 [data-theme="dark"]:text-blue-400 border-blue-200 [data-theme="dark"]:border-blue-900/30',
  neutral:
    'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)]',
};

interface BadgeProps {
  variant?: keyof typeof variants;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ variant = 'neutral', children, className = '', dot }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            variant === 'success'
              ? 'bg-emerald-500'
              : variant === 'error'
                ? 'bg-red-500'
                : variant === 'warning'
                  ? 'bg-amber-500'
                  : variant === 'info'
                    ? 'bg-blue-500'
                    : 'bg-[var(--color-text-muted)]'
          }`}
        />
      )}
      {children}
    </span>
  );
}
