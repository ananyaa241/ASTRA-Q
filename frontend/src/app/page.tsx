'use client';
import dynamic from 'next/dynamic';
import { useThreatData } from '@/hooks/useThreatData';
import MetricBanner from '@/components/MetricBanner';
import ThreatTable from '@/components/ThreatTable';
import AlertPanel from '@/components/AlertPanel';
import AuditTrail from '@/components/AuditTrail';

const ThreatGraph = dynamic(() => import('@/components/ThreatGraph'), { ssr: false });

export default function DashboardPage() {
  const {
    threats, stats, graph, auditEntries,
    alerts, metrics, loading, wsStatus, usingDemo, dismissAlert,
  } = useThreatData();

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
      background: '#070b14',
      zIndex: 1,
    }}>

      {/* ══ HEADER ─ fixed height, never scrolls ══════════════════════ */}
      <header style={{
        flexShrink: 0,
        height: 52,
        zIndex: 50,
        background: 'rgba(7,11,20,0.94)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(34,211,238,0.1)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        {/* Logo cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 30, height: 30,
            background: 'linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)',
            borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: '#fff',
            boxShadow: '0 0 18px rgba(34,211,238,0.4)',
          }}>Æ</div>
          <span style={{
            fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px',
            background: 'linear-gradient(90deg, #22d3ee, #a5b4fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>AEGIS-Q</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)',
            padding: '2px 7px', border: '1px solid rgba(34,211,238,0.15)',
            borderRadius: 4, letterSpacing: '0.1em', flexShrink: 0,
          }}>v1.0.0 · CERT r4.2</span>
        </div>

        {/* Right cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* WS status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className={`status-dot ${
              wsStatus === 'connected'  ? 'live'        :
              wsStatus === 'connecting' ? 'connecting'  :
              wsStatus === 'error'      ? 'error'       : 'disconnected'
            }`} />
            <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {wsStatus.toUpperCase()}
            </span>
          </div>

          {/* PQC badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 6,
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.25)',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span style={{ fontSize: 9, color: '#a5b4fc', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              ML-KEM-1024 · ML-DSA-87
            </span>
          </div>

          {/* Tier counters */}
          {stats && (
            <div style={{ display: 'flex', gap: 10 }}>
              {stats.tiers.map(t => (
                <div key={t.tier} style={{ textAlign: 'center', lineHeight: 1 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    color: t.tier === 'CRITICAL' ? 'var(--color-critical)'
                         : t.tier === 'HIGH'     ? 'var(--color-high)'
                         : t.tier === 'MEDIUM'   ? 'var(--color-medium)'
                         : 'var(--color-low)',
                  }}>{t.count}</div>
                  <div style={{ fontSize: 8, color: 'var(--color-text-muted)', letterSpacing: '0.08em', marginTop: 1 }}>
                    {t.tier}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ══ METRIC BANNER ─ fixed height ══════════════════════════════ */}
      <div style={{ flexShrink: 0 }}>
        <MetricBanner metrics={metrics} wsStatus={wsStatus} />
      </div>

      {/* ══ DEMO BANNER (conditional, fixed height) ════════════════════ */}
      {usingDemo && (
        <div style={{
          flexShrink: 0,
          margin: '0 14px',
          padding: '5px 14px',
          background: 'rgba(234,179,8,0.07)',
          border: '1px solid rgba(234,179,8,0.22)',
          borderRadius: 7,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: 'var(--color-medium)',
          fontFamily: 'var(--font-mono)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          DEMO MODE — Showing synthetic CERT r4.2 data. Start Docker to stream live events.
        </div>
      )}

      {/* ══ ALERT PANEL (conditional, max-height clamped) ══════════════ */}
      {alerts.length > 0 && (
        <div style={{
          flexShrink: 0,
          maxHeight: 140,
          overflowY: 'auto',
          padding: '6px 14px 0',
        }}>
          <AlertPanel alerts={alerts} onDismiss={dismissAlert} />
        </div>
      )}

      {/* ══ LOADING SPINNER ══════════════════════════════════════════ */}
      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 44, height: 44,
              border: '2px solid rgba(34,211,238,0.15)',
              borderTopColor: 'var(--color-cyan)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 14px',
            }} />
            <p style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              Connecting to Aegis-Q...
            </p>
          </div>
        </div>
      )}

      {/* ══ MAIN CONTENT — fills remaining space, never grows beyond ══ */}
      {!loading && (
        <main style={{
          flex: 1,
          minHeight: 0,           /* critical: allows children to shrink below content size */
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '10px 14px 12px',
          overflow: 'hidden',
        }}>

          {/* ── Primary grid: Graph (flex: grows) + Table (fixed width) ── */}
          <div style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 390px',
            gap: 10,
          }}>

            {/* ─── ENTITY GRAPH PANEL ─────────────────────────────────── */}
            <div className="glass-card scroll-panel">
              {/* Card header */}
              <div className="scroll-panel__header" style={{
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                  </svg>
                  <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-text-primary)' }}>
                    Entity Relationship Graph
                  </span>
                </div>
                {graph && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Users', color: '#22d3ee' },
                      { label: 'PCs',   color: '#f59e0b' },
                      { label: 'Files', color: '#f43f5e' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }} />
                        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{item.label}</span>
                      </div>
                    ))}
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {graph.anomalous_edge_count} anomalous edges
                    </span>
                  </div>
                )}
              </div>

              {/* Graph fills the remaining flex space — D3 reads clientHeight */}
              <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
                {graph ? (
                  <ThreatGraph topology={graph} />
                ) : (
                  <div className="empty-state">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p>Graph data unavailable</p>
                  </div>
                )}
              </div>
            </div>

            {/* ─── THREAT TABLE PANEL ─────────────────────────────────── */}
            <ThreatTable threats={threats} />
          </div>

          {/* ── AUDIT TRAIL — fixed-height panel at bottom ─────────────── */}
          <div style={{ flexShrink: 0 }}>
            <AuditTrail entries={auditEntries} />
          </div>
        </main>
      )}
    </div>
  );
}
