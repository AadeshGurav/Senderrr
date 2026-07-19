import { Loader2 } from 'lucide-react';

interface QrSkeletonProps {
  message?: string;
}

/**
 * A skeleton placeholder for QR code loading state.
 * Shows a QR-sized grey square with a spinner overlay.
 */
export function QrSkeleton({ message = 'Preparing QR code...' }: QrSkeletonProps) {
  return (
    <div className="text-center space-y-4">
      <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 inline-block mx-auto animate-pulse">
        <div className="w-64 h-64 flex items-center justify-center relative">
          {/* QR-like grid pattern skeleton */}
          <div className="w-full h-full flex flex-col gap-1 p-4">
            {Array.from({ length: 6 }).map((_, row) => (
              <div key={row} className="flex gap-1">
                {Array.from({ length: 6 }).map((_, col) => (
                  <div
                    key={col}
                    className={`flex-1 aspect-square rounded-sm ${
                      (row + col) % 3 === 0
                        ? 'bg-slate-300 dark:bg-slate-600'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
          {/* Centered spinner overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white/80 dark:bg-slate-900/80 rounded-full p-3">
              <Loader2 size={28} className="animate-spin text-[var(--color-primary)]" />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded mx-auto animate-pulse" />
        <div className="h-3 w-56 bg-slate-100 dark:bg-slate-800 rounded mx-auto animate-pulse" />
      </div>
      <p className="text-xs text-[var(--color-text-muted)] animate-pulse">{message}</p>
    </div>
  );
}
