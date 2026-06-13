import React from 'react';

// Refined circular spinner — drop-in replacement for animate-pulse text labels.
// The wrapper span rotates so the arc sweep stays visually stable.
export function LoadingSpinner({ size = 16, className = '', style }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center ${className}`}
      style={{
        width:     size,
        height:    size,
        animation: 'fl-spin 0.72s linear infinite',
        ...style,
      }}
      aria-label="Loading"
      role="status"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* Track */}
        <circle
          cx="12" cy="12" r="10"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeOpacity="0.14"
        />
        {/* Arc */}
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

// Compact inline dots — for button loading states or subtle inline feedback
export function LoadingDots({ size = 'md', className = '' }) {
  const dotSize = size === 'sm' ? 'h-[3px] w-[3px]' : 'h-1 w-1';
  const gap     = size === 'sm' ? 'gap-[4px]' : 'gap-1.5';
  return (
    <span
      className={`inline-flex items-center ${gap} ${className}`}
      aria-label="Loading"
      role="status"
    >
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`${dotSize} rounded-full bg-current`}
          style={{
            animation:      'fl-dot-bounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 150}ms`,
            opacity: 0.6,
          }}
        />
      ))}
    </span>
  );
}

// Full-area loading placeholder — centred spinner for async content regions
export function LoadingState({
  label = 'Loading…',
  size = 20,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-tx-faint ${className}`}
      role="status"
    >
      <LoadingSpinner size={size} className="text-accent opacity-70" />
      {label && (
        <span className="text-sm text-tx-faint">{label}</span>
      )}
    </div>
  );
}
