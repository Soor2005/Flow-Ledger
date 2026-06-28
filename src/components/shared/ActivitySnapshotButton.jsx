import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import ActivitySnapshotModal from './ActivitySnapshotModal';

/**
 * "📸 Activity Snapshot" — lives in the top toolbar beside the Productivity
 * Score widget. Opens a modal to generate a shareable PNG summary of the
 * user's tracked activity for the selected day/week/month.
 */
export default function ActivitySnapshotButton({ userId, accountName, initials, logoSrc }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="no-drag box-border flex shrink-0 items-center gap-2"
        title="Generate a shareable productivity snapshot"
        style={{
          height: 44,
          padding: '0 14px',
          borderRadius: 12,
          background: hover ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.035)',
          border: `1px solid ${hover ? 'rgba(139,92,246,0.32)' : 'rgba(255,255,255,0.07)'}`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          transition: 'background 0.2s, border-color 0.2s, transform 0.15s',
          boxShadow: hover ? '0 4px 16px rgba(139,92,246,0.18)' : 'none',
          transform: hover ? 'translateY(-1px)' : 'none',
          cursor: 'pointer',
        }}
      >
        <Camera size={15} style={{ color: hover ? '#C4B5FD' : '#A9A6C4', flexShrink: 0 }} />
        <span className="whitespace-nowrap text-[12px] font-semibold" style={{ color: hover ? '#E5E2F5' : 'rgba(255,255,255,0.78)' }}>
          Activity Snapshot
        </span>
      </button>

      <ActivitySnapshotModal
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        accountName={accountName}
        initials={initials}
        logoSrc={logoSrc}
      />
    </>
  );
}
