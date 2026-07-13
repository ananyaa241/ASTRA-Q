'use client';
import dynamic from 'next/dynamic';
import { useThreatData } from '@/hooks/useThreatData';
import MetricBanner from '@/components/MetricBanner';
import ThreatTable from '@/components/ThreatTable';
import AlertPanel from '@/components/AlertPanel';
import AuditTrail from '@/components/AuditTrail';

// D3 graph must be client-side only (no SSR)
const ThreatGraph = dynamic(() => import('@/components/ThreatGraph'), { ssr: false });

export default function DashboardPage() {
  const {
    threats, stats, graph, auditEntries,
    alerts, metrics, loading, error, wsStatus, dismissAlert,
  } = useThreatData();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top Navigation Bar ───────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(7, 11, 20, 0.92)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(34,211,238,0.1)',
        padding: '0 24px',
        height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px',
            boxShadow: '0 0 20px rgba(34,211,238,0.4)',
          }}>Æ</div>
          <span style={{
            fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px',
            background: 'linear-gradient(90deg, #22d3ee, #a5b4fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>AEGIS-Q</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)',
            padding: '2px 8px', border: '1px solid rgba(34,211,238,0.15)',
            borderRadius: 4, marginLeft: 4, letterSpacing: '0.1em',
          }}>v1.0.0 · CERT r4.2</span>
        </div>

        {/* Header right cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* WS Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`status-dot ${wsStatus === 'connected' ? 'live' : wsStatus === 'error' ? 'error' : 'disconnected'}`} />
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {wsStatus.toUpperCase()}
            </span>
          </div>

          {/* PQC indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 6,
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.25)',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span style={{ fontSize: 10, color: '#a5b4fc', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              ML-KEM-1024 · ML-DSA-87
            </span>
          </div>

          {/* Threat counts */}
          {stats && (
            <div style={{ display: 'flex', gap: 12 }}>
              {stats.tiers.map(t => (
                <div key={t.tier} style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    color: t.tier === 'CRITICAL' ? 'var(--color-critical)'
                         : t.tier === 'HIGH' ? 'var(--color-high)'
                         : t.tier === 'MEDIUM' ? 'var(--color-medium)'
                         : 'var(--color-low)',
                  }}>{t.count}</div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>{t.tier}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Metric Banner ─────────────────────────────────────────── */}
      <MetricBanner metrics={metrics} wsStatus={wsStatus} />

      {/* ── Loading / Error States ────────────────────────────────── */}
      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48,
              border: '2px solid rgba(34,211,238,0.2)',
              borderTopColor: 'var(--color-cyan)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            <p style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              Connecting to Aegis-Q...
            </p>
          </div>
        </div>
      )}

      {!loading && (
        <main style={{ flex: 1, padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Alert Panel ─────────────────────────────────────── */}
          {alerts.length > 0 && (
            <AlertPanel alerts={alerts} onDismiss={dismissAlert} />
          )}

          {/* ── Main Grid: Graph (left) + Table (right) ────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 420px',
            gap: 16,
            flex: 1,
            minHeight: 0,
          }}>
            {/* Threat Graph */}
            <div className="glass-card" style={{ overflow: 'hidden', minHeight: 520 }}>
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                  </svg>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
                    Entity Relationship Graph
                  </span>
                </div>
                {graph && (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    {[
                      { label: 'Users', color: '#22d3ee' },
                      { label: 'PCs', color: '#f59e0b' },
                      { label: 'Files', color: '#f43f5e' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{item.label}</span>
                      </div>
                    ))}
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {graph.anomalous_edge_count} anomalous edges
                    </span>
                  </div>
                )}
              </div>
              {graph ? (
                <ThreatGraph topology={graph} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 460, color: 'var(--color-text-muted)' }}>
                  Loading graph...
                </div>
              )}
            </div>

            {/* Threat Table */}
            <ThreatTable threats={threats} />
          </div>

          {/* ── Audit Trail ──────────────────────────────────────── */}
          <AuditTrail entries={auditEntries} />
        </main>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
