'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ThreatSession } from '@/lib/types';
import { TIER_COLORS } from '@/lib/types';
import { useMounted } from '@/hooks/useMounted';

type ContainmentAction = 'ISOLATE' | 'LOCK_ACCOUNT' | 'MONITOR_ENHANCED' | 'ALERT_ANALYST';

interface Props {
  threats: ThreatSession[];
  onContain: (session: ThreatSession, action: ContainmentAction) => void;
}

const ACTIONS: ContainmentAction[] = ['ISOLATE', 'LOCK_ACCOUNT', 'ALERT_ANALYST'];

function useElapsedTime(mountTime: number): string {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - mountTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [mountTime]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface SessionRowProps {
  session: ThreatSession;
  mountTime: number;
  onContain: (session: ThreatSession, action: ContainmentAction) => void;
}

function SessionRow({ session, mountTime, onContain }: SessionRowProps) {
  const elapsed = useElapsedTime(mountTime);
  const mounted = useMounted();
  const [pickerOpen, setPickerOpen] = useState(false);
  const tc = TIER_COLORS[session.risk_tier];

  const handleAction = useCallback((action: ContainmentAction) => {
    setPickerOpen(false);
    onContain(session, action);
  }, [session, onContain]);

  const handleMonitor = useCallback(() => {
    onContain(session, 'MONITOR_ENHANCED');
  }, [session, onContain]);

  const isCritical = session.risk_tier === 'CRITICAL';

  return (
    <div
      className={`session-card ${isCritical ? 'session-card-critical' : ''}`}
      style={{ borderLeftColor: tc.border, position: 'relative' }}
    >
      {/* Row content */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* User ID */}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--color-cyan)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {session.user_id}
        </span>

        {/* Risk tier badge */}
        <span style={{
          fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700,
          padding: '1px 5px', borderRadius: 3,
          background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`,
          flexShrink: 0,
        }}>
          {session.risk_tier}
        </span>

        {/* Elapsed time */}
        <span style={{
          fontSize: 8, fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-muted)', flexShrink: 0,
        }} suppressHydrationWarning>
          {mounted ? elapsed : '--:--'}
        </span>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {/* Contain button */}
          <button
            onClick={() => setPickerOpen(o => !o)}
            aria-label="Contain session"
            style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 4, cursor: 'pointer', padding: '2px 5px',
              color: '#ef4444', fontSize: 11, lineHeight: 1, transition: 'all 150ms',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
          >
            🔒
          </button>
          {/* Monitor button */}
          <button
            onClick={handleMonitor}
            aria-label="Monitor enhanced"
            style={{
              background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)',
              borderRadius: 4, cursor: 'pointer', padding: '2px 5px',
              color: 'var(--color-cyan)', fontSize: 11, lineHeight: 1, transition: 'all 150ms',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(34,211,238,0.18)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(34,211,238,0.08)'}
          >
            👁
          </button>
        </div>
      </div>

      {/* Score bar */}
      <div style={{
        height: 2, background: 'rgba(255,255,255,0.05)',
        borderRadius: 1, marginTop: 5,
      }}>
        <div style={{
          height: '100%', borderRadius: 1,
          width: `${session.fused_score * 100}%`,
          background: `linear-gradient(90deg, ${tc.text}88, ${tc.text})`,
          transition: 'width 300ms',
        }} />
      </div>

      {/* Action picker dropdown */}
      {pickerOpen && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: 3,
          background: 'rgba(7,11,20,0.98)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(34,211,238,0.2)', borderRadius: 8,
          padding: 4, minWidth: 140,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          {ACTIONS.map(action => (
            <button
              key={action}
              onClick={() => handleAction(action)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 10px', background: 'transparent',
                border: 'none', cursor: 'pointer', borderRadius: 6,
                fontSize: 10, fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary)', transition: 'all 120ms',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(34,211,238,0.1)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              {action.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionPanel({ threats, onContain }: Props) {
  const mountTimeRef = useRef(Date.now());

  // Top 5 CRITICAL + HIGH sorted by fused_score descending
  const topSessions = threats
    .filter(t => t.risk_tier === 'CRITICAL' || t.risk_tier === 'HIGH')
    .sort((a, b) => b.fused_score - a.fused_score)
    .slice(0, 5);

  if (topSessions.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ fontWeight: 600, fontSize: 12 }}>Active Sessions</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '12px 0' }}>
          No high-risk sessions detected.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ flexShrink: 0 }}>
      {/* Header */}
      <div className="scroll-panel__header" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ fontWeight: 600, fontSize: 12 }}>Active Sessions</span>
        </div>
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)',
          color: 'var(--color-critical)', padding: '1px 6px',
          background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)',
          borderRadius: 4,
        }}>
          {topSessions.length} monitored
        </span>
      </div>

      {/* Session rows */}
      <div style={{ overflowY: 'auto', maxHeight: 200 }}>
        {topSessions.map(session => (
          <SessionRow
            key={session.session_id}
            session={session}
            mountTime={mountTimeRef.current}
            onContain={onContain}
          />
        ))}
      </div>
    </div>
  );
}
