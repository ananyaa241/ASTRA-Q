'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ThreatSession } from '@/lib/types';
import { TIER_COLORS } from '@/lib/types';
import { triggerContainment } from '@/lib/api';

interface Props { threats: ThreatSession[]; }

const ACTIONS = ['ISOLATE', 'LOCK_ACCOUNT', 'MONITOR_ENHANCED', 'ALERT_ANALYST'] as const;

export default function ThreatTable({ threats }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [containing, setContaining] = useState<string | null>(null);
  const [contained, setContained] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>('ALL');

  const filtered = filter === 'ALL' ? threats : threats.filter(t => t.risk_tier === filter);

  const handleContain = async (session: ThreatSession, action: typeof ACTIONS[number]) => {
    setContaining(session.session_id);
    try {
      await triggerContainment({
        session_id: session.session_id,
        user_id: session.user_id,
        action,
        analyst_id: 'analyst_soc',
        reason: `SOC triggered ${action} via dashboard`,
      });
      setContained(prev => new Set([...prev, session.session_id]));
    } catch {
      // silently handle
    } finally {
      setContaining(null);
    }
  };

  return (
    <div className="glass-card scroll-panel">
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }} className="scroll-panel__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Threat Sessions</span>
          <span style={{
            background: 'var(--color-critical-bg)', color: 'var(--color-critical)',
            border: '1px solid var(--color-critical)', borderRadius: 999,
            fontSize: 10, padding: '1px 7px', fontFamily: 'var(--font-mono)', fontWeight: 700,
          }}>{filtered.length}</span>
        </div>

        {/* Tier filter pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(tier => (
            <button key={tier} onClick={() => setFilter(tier)}
              style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 10, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.05em',
                border: '1px solid',
                background: filter === tier
                  ? (tier === 'ALL' ? 'rgba(34,211,238,0.15)' : TIER_COLORS[tier as keyof typeof TIER_COLORS]?.bg || 'transparent')
                  : 'transparent',
                borderColor: filter === tier
                  ? (tier === 'ALL' ? 'var(--color-cyan)' : TIER_COLORS[tier as keyof typeof TIER_COLORS]?.border || 'var(--color-border)')
                  : 'var(--color-border)',
                color: filter === tier
                  ? (tier === 'ALL' ? 'var(--color-cyan)' : TIER_COLORS[tier as keyof typeof TIER_COLORS]?.text || 'var(--color-text-primary)')
                  : 'var(--color-text-muted)',
                transition: 'all 150ms',
              }}>
              {tier}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '80px 1fr 68px 80px 68px',
        gap: 8, padding: '6px 14px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        {['USER', 'THREAT SCORE', 'LATENCY', 'TIER', 'ACTION'].map(h => (
          <span key={h} className="section-label" style={{ fontSize: 9 }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <AnimatePresence initial={false}>
          {filtered.map((t, i) => {
            const tc = TIER_COLORS[t.risk_tier];
            const isSelected = selected === t.session_id;
            const isContained = contained.has(t.session_id);

            return (
              <motion.div
                key={t.session_id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2, delay: i < 10 ? i * 0.03 : 0 }}
                onClick={() => setSelected(isSelected ? null : t.session_id)}
                style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr 68px 80px 68px',
                  gap: 8, padding: '9px 14px', cursor: 'pointer',
                  borderBottom: '1px solid rgba(34,211,238,0.04)',
                  background: isSelected ? 'rgba(34,211,238,0.06)' : isContained ? 'rgba(34,197,94,0.04)' : 'transparent',
                  boxShadow: isSelected ? 'inset 2px 0 0 var(--color-cyan)' : 'none',
                  transition: 'background 150ms, box-shadow 150ms',
                }}
                whileHover={{ background: isSelected ? 'rgba(34,211,238,0.08)' : 'rgba(34,211,238,0.03)' }}
              >
                {/* User ID */}
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-cyan)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {t.pqc_signed && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2.5">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  )}
                  {t.user_id}
                </div>

                {/* Score bar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: tc.text, fontWeight: 700 }}>
                      {(t.fused_score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{
                      width: `${t.fused_score * 100}%`,
                      background: `linear-gradient(90deg, ${tc.text}88, ${tc.text})`,
                    }} />
                  </div>
                  {isSelected && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
                        GCN: <span style={{ color: '#22d3ee' }}>{(t.gcn_score * 100).toFixed(0)}%</span>
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
                        XFMR: <span style={{ color: '#a5b4fc' }}>{(t.transformer_score * 100).toFixed(0)}%</span>
                      </span>
                      {t.scenario_hints[0] && (
                        <span style={{ fontSize: 9, color: '#f59e0b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                          ⚠ {t.scenario_hints[0]}
                        </span>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* Latency */}
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, display: 'flex', alignItems: 'center',
                  color: t.inference_latency_ms <= 35 ? 'var(--color-low)' : 'var(--color-critical)',
                }}>
                  {t.inference_latency_ms.toFixed(1)}ms
                </div>

                {/* Tier badge */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span className={`badge badge-${t.risk_tier.toLowerCase()}`} style={{ fontSize: 9, padding: '2px 7px' }}>
                    {t.risk_tier}
                  </span>
                </div>

                {/* Action */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {isContained ? (
                    <span style={{ fontSize: 9, color: 'var(--color-low)', fontFamily: 'var(--font-mono)' }}>✓ DONE</span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleContain(t, 'ISOLATE'); }}
                      disabled={containing === t.session_id}
                      style={{
                        padding: '5px 10px', fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        background: 'rgba(34,211,238,0.1)', color: 'var(--color-cyan)',
                        border: '1px solid rgba(34,211,238,0.4)',
                        boxShadow: '0 0 12px rgba(34,211,238,0.1)',
                        borderRadius: '6px',
                        transition: 'all 200ms',
                        opacity: containing === t.session_id ? 0.5 : 1,
                      }}>
                      {containing === t.session_id ? '...' : 'CONTAIN'}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No threats in this tier
          </div>
        )}
      </div>
    </div>
  );
}
