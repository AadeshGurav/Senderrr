import type { ReactNode, HTMLAttributes } from 'react';
import { forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, hover = false, className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-[var(--shadow-sm)] transition-all duration-200 ${
        hover
          ? 'hover:shadow-[var(--shadow-md)] hover:border-[var(--color-primary)]/20 cursor-pointer'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';

export function CardHeader({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-light)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}

export function CardFooter({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-end gap-3 px-6 py-3 border-t border-[var(--color-border-light)] ${className}`}
    >
      {children}
    </div>
  );
}
