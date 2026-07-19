import './Skeleton.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'rect' | 'circle';
  className?: string;
}

export function Skeleton({ width = '100%', height = '1rem', variant = 'rect', className = '' }: SkeletonProps) {
  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return <div className={`skeleton skeleton-${variant} ${className}`} style={style} aria-hidden="true" />;
}

export function SessionCardSkeleton() {
  return (
    <div className="session-card skeleton-card">
      <div className="session-header">
        <Skeleton width={120} height={20} />
        <Skeleton width={80} height={24} variant="rect" />
      </div>
      <div className="session-details">
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={14} />
      </div>
      <div className="session-meta">
        <Skeleton width={100} height={12} />
        <Skeleton width={80} height={12} />
      </div>
      <div className="session-actions">
        <Skeleton width={60} height={32} variant="rect" />
        <Skeleton width={60} height={32} variant="rect" />
        <Skeleton width={60} height={32} variant="rect" />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  const widths = ['45%', '30%', '20%', '25%', '35%', '20%', '30%', '20%', '30%', '40%'];
  return (
    <>
      {Array.from({ length: rows }).map((_, ri) => (
        <tr key={ri} className="skeleton-row">
          {Array.from({ length: columns }).map((_, ci) => (
            <td key={ci}>
              <Skeleton width={widths[ci % widths.length]} height={16} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function PageSkeleton() {
  return (
    <div className="p-6 max-w-6xl space-y-6 animate-pulse">
      <div className="space-y-2">
        <Skeleton width="200px" height={28} />
        <Skeleton width="320px" height={16} />
      </div>
      <div className="h-10 w-72 rounded-lg bg-slate-200 dark:bg-slate-700" />
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-slate-100 dark:border-slate-800">
            <Skeleton width="20%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="10%" height={16} />
            <Skeleton width="10%" height={16} />
            <Skeleton width="20%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-6 w-12 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 animate-pulse space-y-3">
          <Skeleton width="60%" height={18} />
          <Skeleton width="100%" height={14} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="40%" height={14} />
        </div>
      ))}
    </div>
  );
}
