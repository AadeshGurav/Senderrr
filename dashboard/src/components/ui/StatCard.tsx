import { type LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; direction: 'up' | 'down' };
  loading?: boolean;
}

export function StatCard({ label, value, icon: Icon, trend, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[var(--color-surface-hover)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-20 bg-[var(--color-surface-hover)] rounded" />
            <div className="h-7 w-14 bg-[var(--color-surface-hover)] rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 transition-all duration-200 hover:shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-ghost)] flex items-center justify-center text-[var(--color-primary)]">
            <Icon size={20} />
          </div>
          <div>
            <p className="text-sm text-[var(--color-text-secondary)]">{label}</p>
            <p className="text-2xl font-bold text-[var(--color-text)] mt-0.5 tabular-nums">
              {value}
            </p>
          </div>
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${
              trend.direction === 'up'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-500 dark:text-red-400'
            }`}
          >
            {trend.direction === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {trend.value}
          </div>
        )}
      </div>
    </div>
  );
}
