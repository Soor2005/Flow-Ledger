import React, { useLayoutEffect, useRef } from 'react';

// Wraps a page with a 200ms fade + subtle upward slide on mount.
// Re-triggers on every change to `pageKey` (the current page id).
// Uses direct DOM manipulation to avoid a React state re-render cycle.
export default function PageTransition({ children, pageKey, className = '' }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Snap to hidden
    el.style.transition = 'none';
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(6px)';

    // Force reflow, then animate in
    void el.offsetHeight;
    el.style.transition = 'opacity 0.22s ease-out, transform 0.22s ease-out';
    el.style.opacity    = '1';
    el.style.transform  = 'translateY(0)';

    // CRITICAL: once the animation finishes, remove the transform entirely.
    // Any element with a CSS `transform` (even translateY(0)) creates a new
    // containing block for `position: fixed` descendants, which shifts every
    // fixed-position overlay (tooltips, popups) down by this element's top
    // offset relative to the viewport. Clearing it after animation restores
    // correct fixed-position behaviour inside the page.
    const onEnd = () => {
      el.style.transition = '';
      el.style.transform  = '';
    };
    el.addEventListener('transitionend', onEnd, { once: true });
    return () => el.removeEventListener('transitionend', onEnd);
  }, [pageKey]);

  return (
    <div ref={ref} className={`h-full w-full ${className}`}>
      {children}
    </div>
  );
}
