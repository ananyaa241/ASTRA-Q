'use client';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useThreatData } from '@/hooks/useThreatData';
import { useAuth } from '@/context/AuthContext';
import MetricBanner from '@/components/MetricBanner';
import ThreatTable from '@/components/ThreatTable';
import AlertPanel from '@/components/AlertPanel';
import AuditTrail from '@/components/AuditTrail';
import WorkflowTracker from '@/components/WorkflowTracker';
import ArchitectureMap from '@/components/ArchitectureMap';
import SessionPanel from '@/components/SessionPanel';
import NavSidebar from '@/components/common/NavSidebar';
import { triggerContainment } from '@/lib/api';
import type { ThreatSession } from '@/lib/types';
import type { ContainmentAction } from '@/lib/types';

const ThreatGraph = dynamic(() => import('@/components/ThreatGraph'), { ssr: false });

export default function DashboardPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<'control' | 'telemetry' | 'ledger'>('control');

  const {
    threats, graph, auditEntries,
    alerts, metrics, loading, wsStatus, usingDemo, dismissAlert,
  } = useThreatData();

  // ── Derived counts ──────────────────────────────────────────────────────
  const criticalHighCount = useMemo(
    () => threats.filter(t => t.risk_tier === 'CRITICAL' || t.risk_tier === 'HIGH').length,
    [threats]
  );

  // ── Workflow step derived from WebSocket + alerts state ─────────────────
  const workflowStep = useMemo(() => {
    const hasAlert = alerts.some(a => a.type === 'alert');
    const hasCritical = alerts.some(a => a.type === 'alert' && (a as { severity?: string }).severity === 'CRITICAL');
    if (hasCritical) return 9;
    if (hasAlert) return 8;
    if (wsStatus === 'connected') return 7;
    return 6;
  }, [alerts, wsStatus]);

  const hasActiveAlert = alerts.some(a => a.type === 'alert' && (a as { severity?: string }).severity === 'CRITICAL');

  // ── Containment handler ─────────────────────────────────────────────────
  const handleContain = async (threatSession: ThreatSession, action: ContainmentAction) => {
    await triggerContainment({
      session_id: threatSession.session_id,
      user_id: threatSession.user_id,
      action,
      analyst_id: session?.analystId ?? 'analyst_soc',
      reason: `SOC action: ${action} via session panel`,
    });
  };

  const handleTerminate = async (sessionId: string, userId: string) => {
    await triggerContainment({
      session_id: sessionId,
      user_id: userId,
      action: 'ISOLATE',
      analyst_id: session?.analystId ?? 'analyst_soc',
      reason: 'SOC triggered ISOLATE from alert panel',
    });
  };

  const handleSever = async (sessionId: string) => {
    const threat = threats.find(t => t.session_id === sessionId);
    await triggerContainment({
      session_id: sessionId,
      user_id: threat?.user_id ?? 'unknown',
      action: 'ALERT_ANALYST',
      analyst_id: session?.analystId ?? 'analyst_soc',
      reason: 'Connection sever requested from alert panel',
    });
  };

  return (
    /*
     * position:fixed + inset:0 = the shell is ALWAYS exactly the viewport.
     * Nothing inside can cause the page to scroll — panels scroll internally.
     */
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--color-bg-base)',
      zIndex: 1,
    }}>
      {/* ══ NAV SIDEBAR ─ fixed 48px left ══════════════════════════════ */}
      <NavSidebar activePath="/dashboard" criticalCount={criticalHighCount} />

      {/* ══ MAIN COLUMN — offset left by nav sidebar width ════════════ */}
      <div style={{ paddingLeft: 48, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ══ HEADER ─ fixed height, never scrolls ══════════════════════ */}
        <motion.header
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            flexShrink: 0,
            height: 52,
            zIndex: 50,
            background: 'var(--color-bg-glass)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            borderBottom: '1px solid var(--color-border)',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
          {/* Logo cluster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, background: 'var(--color-cyan)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg-surface)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, letterSpacing: '-0.02em',
              color: 'var(--color-text-primary)'
            }}>ASTRA-Q</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)',
              padding: '2px 7px', border: '1px solid var(--color-border)',
              borderRadius: 4, letterSpacing: '0.1em', flexShrink: 0,
            }}>v1.0.0 · CERT r4.2</span>
          </div>

          {/* Right cluster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* WS status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className={`status-dot ${wsStatus === 'connected' ? 'live' :
                wsStatus === 'connecting' ? 'connecting' :
                  wsStatus === 'error' ? 'error' : 'disconnected'
                }`} />
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {wsStatus.toUpperCase()}
              </span>
            </div>

            {/* PQC badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 4,
              background: 'var(--color-cyan-dim)',
              border: '1px solid var(--color-border)',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span style={{ fontSize: 9, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                ML-KEM-1024 · ML-DSA-87
              </span>
            </div>

            {/* Sessions monitored count */}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
              {criticalHighCount} sessions monitored
            </span>

            {/* Switch user link */}
            <button
              onClick={() => router.push('/access')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', fontSize: 10,
                fontFamily: 'var(--font-mono)', padding: '2px 6px',
                borderRadius: 4, transition: 'color 150ms',
                textDecoration: 'underline',
              }}
              onMouseOver={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
              onMouseOut={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              Switch User
            </button>
          </div>
        </motion.header>

        {/* ══ TAB SELECTOR ════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex',
          gap: 4,
          padding: '8px 20px',
          background: 'var(--color-bg-elevated)',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0
        }}>
          {[
            {
              id: 'control', label: 'Control Center', icon: (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" />
                  <rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
                </svg>
              )
            },
            {
              id: 'telemetry', label: 'Visual Telemetry', icon: (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                </svg>
              )
            },
            {
              id: 'ledger', label: 'Secure Ledger', icon: (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                </svg>
              )
            }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
                  background: isActive ? 'var(--color-bg-surface)' : 'transparent',
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.02)' : 'none',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ══ LOADING SPINNER ══════════════════════════════════════════ */}
        {loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 44, height: 44,
                border: '1px solid rgba(0,0,0,0.08)',
                borderTopColor: 'var(--color-cyan)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 14px',
              }} />
              <p style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                Connecting to ASTRA-Q...
              </p>
            </div>
          </div>
        )}

        {/* ══ CONTENT AREA (Conditional on activeTab) ════════════════════ */}
        {!loading && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {activeTab === 'control' && (
              <div className="tab-control-layout" style={{
                display: 'grid',
                gridTemplateColumns: '1fr 390px',
                gap: 12,
                padding: '12px 20px',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
                  <div style={{ flexShrink: 0 }}>
                    <MetricBanner metrics={metrics} wsStatus={wsStatus} />
                  </div>
                  <WorkflowTracker
                    currentStep={workflowStep}
                    alertStep={hasActiveAlert ? 11 : null}
                    sessionCount={criticalHighCount}
                  />
                  {alerts.length > 0 && (
                    <div style={{ flexShrink: 0, maxHeight: 120, overflowY: 'auto' }}>
                      <AlertPanel
                        alerts={alerts}
                        onDismiss={dismissAlert}
                        onTerminate={handleTerminate}
                        onSever={handleSever}
                      />
                    </div>
                  )}
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <ThreatTable threats={threats} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <SessionPanel threats={threats} onContain={handleContain} />
                </div>
              </div>
            )}

            {activeTab === 'telemetry' && (
              <div className="tab-telemetry-layout" style={{
                display: 'grid',
                gridTemplateColumns: '240px 1fr',
                gap: 12,
                padding: '12px 20px',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <ArchitectureMap
                    threats={threats}
                    alerts={alerts}
                    metrics={metrics}
                    wsStatus={wsStatus}
                  />
                </div>
                <motion.div
                  className="glass-card scroll-panel"
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

                  {/* Card header */}
                  <div className="scroll-panel__header" style={{
                    padding: '10px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                      </svg>
                      <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-text-primary)' }}>
                        Entity Relationship Graph
                      </span>
                    </div>
                    {graph && (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        {[
                          { label: 'Users', color: '#09090b' },
                          { label: 'PCs', color: '#71717a' },
                          { label: 'Files', color: '#a1a1aa' },
                        ].map(item => (
                          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color }} />
                            <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{item.label}</span>
                          </div>
                        ))}
                        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {graph.anomalous_edge_count} anomalous edges
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
                    {graph ? (
                      <ThreatGraph topology={graph} />
                    ) : (
                      <div className="empty-state">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <p>Graph data unavailable</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            {activeTab === 'ledger' && (
              <div className="tab-ledger-layout" style={{
                padding: '12px 20px',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                  id="audit-trail">
                  <AuditTrail entries={auditEntries} />
                </motion.div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
