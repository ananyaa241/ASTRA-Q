'use client';
import { motion, AnimatePresence } from 'framer-motion';
import type { WSMessage } from '@/lib/types';
import { TIER_COLORS } from '@/lib/types';

type AlertMsg = Extract<WSMessage, { type: 'alert' }>;

interface Props {
  alerts: WSMessage[];
  onDismiss: (idx: number) => void;
}

export default function AlertPanel({ alerts, onDismiss }: Props) {
  // Preserve original index for correct dismiss targeting
  const alertList: Array<{ msg: AlertMsg; originalIdx: number }> = alerts
    .map((a, i) => ({ msg: a as AlertMsg, originalIdx: i }))
    .filter(({ msg }) => msg.type === 'alert');

  if (alertList.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <AnimatePresence initial={false}>
        {alertList.slice(0, 5).map(({ msg: alert, originalIdx }) => {
          const tc = TIER_COLORS[alert.severity];
          return (
            <motion.div
              key={`${alert.session_id}-${originalIdx}`}
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', borderRadius: 10,
                background: tc.bg,
                border: `1px solid ${tc.border}`,
                boxShadow: alert.severity === 'CRITICAL' ? tc.glow : 'none',
              }}
            >
              {/* Severity icon */}
              <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8,
                background: `${tc.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {alert.severity === 'CRITICAL' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tc.text} strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tc.text} strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span className={`badge badge-${alert.severity.toLowerCase()}`} style={{ fontSize: 9 }}>
                    {alert.severity}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-cyan)' }}>
                    {alert.user_id}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {alert.session_id}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: tc.text, fontWeight: 700 }}>
                    {(alert.score * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {alert.description}
                </div>
              </div>

              <div style={{ fontSize: 9, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}
                suppressHydrationWarning>
                {new Date(alert.timestamp).toLocaleTimeString()}
              </div>

              {/* Dismiss — uses original index for correct splice */}
              <button
                onClick={() => onDismiss(originalIdx)}
                aria-label="Dismiss alert"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-muted)', fontSize: 18, lineHeight: 1,
                  flexShrink: 0, display: 'flex', alignItems: 'center',
                  padding: 4, borderRadius: 4, transition: 'color 150ms',
                }}
                onMouseOver={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                onMouseOut={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                ×
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {alertList.length > 5 && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', padding: '4px 0' }}>
          + {alertList.length - 5} more alert{alertList.length - 5 !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
