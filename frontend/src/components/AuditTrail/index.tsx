'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AuditEntry } from '@/lib/types';
import { verifyAuditEntry } from '@/lib/api';
import { useMounted } from '@/hooks/useMounted';

interface Props { entries: AuditEntry[]; }

const ACTION_ICONS: Record<string, string> = {
  ALERT_GENERATED:        '🔴',
  CONTAINMENT_TRIGGERED:  '🔒',
  ALERT_DISMISSED:        '✓',
  MODEL_RETRAIN:          '⚙',
  KEY_ROTATION:           '🔑',
  ANALYST_LOGIN:          '👤',
  ANALYST_LOGOUT:         '👤',
  GRAPH_QUERY:            '🕸',
  SIGNATURE_VERIFIED:     '✅',
  SYSTEM_START:           '🚀',
};

const ACTION_COLORS: Record<string, string> = {
  ALERT_GENERATED:        '#ef4444',
  CONTAINMENT_TRIGGERED:  '#f97316',
  ALERT_DISMISSED:        '#22c55e',
  MODEL_RETRAIN:          '#22d3ee',
  KEY_ROTATION:           '#a5b4fc',
  SYSTEM_START:           '#22d3ee',
};

export default function AuditTrail({ entries }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, boolean>>({});
  const mounted = useMounted();

  const handleVerify = async (entryId: string) => {
    setVerifying(entryId);
    try {
      const result = await verifyAuditEntry(entryId);
      setVerifyResults(prev => ({ ...prev, [entryId]: result.verified }));
    } catch {
      setVerifyResults(prev => ({ ...prev, [entryId]: false }));
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="glass-card scroll-panel" style={{ maxHeight: 230 }}>
      {/* Header */}
      <div style={{
        padding: '9px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }} className="scroll-panel__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span style={{ fontWeight: 600, fontSize: 13 }}>PQC Audit Trail</span>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', color: '#a5b4fc',
            padding: '3px 8px', background: 'rgba(165,180,252,0.15)',
            border: '1px solid rgba(165,180,252,0.4)', borderRadius: 6,
            boxShadow: '0 0 16px rgba(165,180,252,0.2), inset 0 0 8px rgba(165,180,252,0.1)'
          }}>ML-DSA-87 · Append-Only</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {entries.length} entries
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '120px 140px 90px 100px 1fr 70px 66px',
        gap: 8, padding: '5px 14px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        {['TIME', 'ACTION', 'ACTOR', 'TARGET', 'HASH / SIG', 'ALGO', 'VERIFY'].map(h => (
          <span key={h} className="section-label" style={{ fontSize: 9 }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => {
            const isExpanded = expanded === entry.id;
            const actionColor = ACTION_COLORS[entry.action_type] || 'var(--color-text-secondary)';
            const verifyResult = verifyResults[entry.id];

            return (
              <motion.div key={entry.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
              >
                {/* Main row */}
                <motion.div
                  onClick={() => setExpanded(isExpanded ? null : entry.id)}
                  whileHover={{ background: 'rgba(34,211,238,0.03)' }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 140px 90px 100px 1fr 70px 66px',
                    gap: 8, padding: '7px 14px', cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border)',
                    background: isExpanded ? 'rgba(34,211,238,0.05)' : 'transparent',
                    boxShadow: isExpanded ? 'inset 2px 0 0 #a5b4fc' : 'none',
                    transition: 'all 150ms',
                  }}
                >
                  {/* Timestamp */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                    <span suppressHydrationWarning>
                      {mounted ? new Date(entry.created_at).toLocaleTimeString() : '--:--:--'}
                    </span>
                  </span>

                  {/* Action */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 10 }}>{ACTION_ICONS[entry.action_type] || '•'}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: actionColor, fontWeight: 600 }}>
                      {entry.action_type.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Actor */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: entry.actor === 'SYSTEM' ? '#22d3ee' : '#f59e0b',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {entry.actor}
                  </span>

                  {/* Target */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {entry.target_user || entry.target_session || '—'}
                  </span>

                  {/* Hash preview */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {entry.payload_hash}
                  </span>

                  {/* Algorithm */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#a5b4fc' }}>
                    {entry.pqc_algorithm}
                  </span>

                  {/* Verify button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVerify(entry.id); }}
                    disabled={verifying === entry.id}
                    style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontWeight: 600, border: '1px solid',
                      background: verifyResult === true ? 'rgba(34,197,94,0.1)'
                        : verifyResult === false ? 'rgba(239,68,68,0.1)'
                        : 'rgba(165,180,252,0.08)',
                      color: verifyResult === true ? '#22c55e'
                        : verifyResult === false ? '#ef4444'
                        : '#a5b4fc',
                      borderColor: verifyResult === true ? '#22c55e44'
                        : verifyResult === false ? '#ef444444'
                        : 'rgba(165,180,252,0.25)',
                      opacity: verifying === entry.id ? 0.5 : 1,
                    }}
                  >
                    {verifying === entry.id ? '...'
                      : verifyResult === true ? '✓ OK'
                      : verifyResult === false ? '✗ FAIL'
                      : 'VERIFY'}
                  </button>
                </motion.div>

                {/* Expanded signature panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        padding: '10px 16px 14px 16px',
                        background: 'rgba(165,180,252,0.04)',
                        borderBottom: '1px solid rgba(165,180,252,0.1)',
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <div className="section-label" style={{ marginBottom: 4 }}>ML-DSA-87 Signature Preview</div>
                            <div style={{
                              fontFamily: 'var(--font-mono)', fontSize: 10, color: '#a5b4fc',
                              background: 'rgba(165,180,252,0.06)', borderRadius: 6,
                              padding: '6px 10px', border: '1px solid rgba(165,180,252,0.15)',
                              wordBreak: 'break-all',
                            }}>
                              {entry.pqc_signature_preview}
                            </div>
                          </div>
                          <div>
                            <div className="section-label" style={{ marginBottom: 4 }}>Signing Key Fingerprint</div>
                            <div style={{
                              fontFamily: 'var(--font-mono)', fontSize: 10, color: '#22d3ee',
                              background: 'rgba(34,211,238,0.06)', borderRadius: 6,
                              padding: '6px 10px', border: '1px solid rgba(34,211,238,0.15)',
                            }}>
                              {entry.signing_key_fingerprint}
                            </div>
                            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--color-text-muted)' }}>
                              Hash: SHA3-512 · Sig: ML-DSA-87 (FIPS 204)
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
