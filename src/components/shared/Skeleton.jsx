import React from 'react';

// Base shimmer block — compose into any layout
export function Skeleton({ className = '', style, rounded = 'rounded-md', ...props }) {
  return (
    <div
      className={`fl-skeleton ${rounded} ${className}`}
      style={style}
      aria-hidden="true"
      {...props}
    />
  );
}

// Multi-line text placeholder
export function SkeletonText({ lines = 3, className = '' }) {
  const widths = ['100%', '85%', '65%', '90%', '75%'];
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}

// Card-shaped placeholder
export function SkeletonCard({ className = '' }) {
  return (
    <div
      className={`rounded-xl border border-brd-subtle bg-bg-card p-4 ${className}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-9 w-9 flex-shrink-0" rounded="rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

// List row placeholder
export function SkeletonRow({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 py-2 ${className}`}>
      <Skeleton className="h-8 w-8 flex-shrink-0" rounded="rounded-lg" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-2.5 w-2/5" />
      </div>
      <Skeleton className="h-5 w-14" rounded="rounded-md" />
    </div>
  );
}

// Metric / stat card placeholder
export function SkeletonStat({ className = '' }) {
  return (
    <div className={`rounded-xl border border-brd-subtle bg-bg-card p-4 ${className}`}>
      <Skeleton className="mb-3 h-2.5 w-1/3" />
      <Skeleton className="mb-2 h-8 w-1/2" rounded="rounded-lg" />
      <Skeleton className="h-2.5 w-2/5" />
    </div>
  );
}

// Chart area placeholder
export function SkeletonChart({ className = '' }) {
  const bars = [55, 80, 45, 95, 70, 60, 85, 40, 75, 90, 50, 65];
  return (
    <div className={`rounded-xl border border-brd-subtle bg-bg-card p-4 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-5 w-20" rounded="rounded-md" />
      </div>
      <div className="flex h-32 items-end gap-1.5">
        {bars.map((pct, i) => (
          <Skeleton
            key={i}
            className="flex-1"
            rounded="rounded-sm"
            style={{ height: `${pct}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// Page-level content skeleton — full loading state for a view
export function SkeletonPage({ stats = 4, rows = 5, className = '' }) {
  return (
    <div className={`flex flex-col gap-4 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" rounded="rounded-lg" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-8 w-24" rounded="rounded-lg" />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: stats }, (_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>

      {/* List */}
      <div className="rounded-xl border border-brd-subtle bg-bg-card px-4 py-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={i < rows - 1 ? 'border-b border-brd-subtle' : ''}>
            <SkeletonRow />
          </div>
        ))}
      </div>
    </div>
  );
}
