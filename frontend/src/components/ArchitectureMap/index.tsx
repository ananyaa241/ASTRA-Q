'use client';
import type { ThreatSession, WSMessage, MetricsPayload } from '@/lib/types';
import type { WSStatus } from '@/hooks/useWebSocket';

interface Props {
  threats: ThreatSession[];
  alerts: WSMessage[];
  metrics: MetricsPayload | null;
  wsStatus: WSStatus;
}

interface LayerConfig {
  label: string;
  color: string;
  pills: string[];
  statusText: string;
  statusColor: string;
  subText?: string;
}

export default function ArchitectureMap({ threats, alerts, metrics, wsStatus }: Props) {
  if (!threats) {
    return (
      <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          Awaiting threat data...
        </p>
      </div>
    );
  }

  const criticalHighCount = threats.filter(t => t.risk_tier === 'CRITICAL' || t.risk_tier === 'HIGH').length;
  const activeAlerts = alerts.filter(a => a.type === 'alert').length;
  const latency = metrics?.p99_latency_ms;
  const isConnected = wsStatus === 'connected';

  const layers: LayerConfig[] = [
    {
      label: 'USERS',
      color: '#22d3ee',
      pills: ['Admins', 'Employees', 'Contractors', 'Vendors'],
      statusText: 'ONLINE',
      statusColor: '#22c55e',
      subText: `${threats.length} active users`,
    },
    {
      label: 'IAM / RISK ENGINE',
      color: '#a5b4fc',
      pills: ['Risk-Based Auth', 'MFA Engine'],
      statusText: isConnected ? 'ONLINE' : 'DEGRADED',
      statusColor: isConnected ? '#22c55e' : '#f59e0b',
    },
    {
      label: 'CORE SECURITY',
      color: '#22d3ee',
      pills: ['PAM Vault', 'Session Tel.', 'AI UBA', 'PQC Module'],
      statusText: 'ONLINE',
      statusColor: '#22c55e',
      subText: latency != null ? `p99: ${latency.toFixed(0)}ms` : undefined,
    },
    {
      label: 'TARGET RESOURCES',
      color: '#f59e0b',
      pills: ['Critical Systems', 'Data Repos', 'Cloud Infra'],
      statusText: 'MONITORED',
      statusColor: '#f59e0b',
      subText: `${criticalHighCount} sessions monitored`,
    },
    {
      label: 'SIEM / SOC',
      color: '#f43f5e',
      pills: ['SIEM', 'Auto Incident Response'],
      statusText: activeAlerts > 0 ? `${activeAlerts} ALERTS` : 'NOMINAL',
      statusColor: activeAlerts > 0 ? '#ef4444' : '#22c55e',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', overflowY: 'auto' }}>
      {layers.map((layer, i) => (
        <div key={layer.label}>
          {/* Layer card */}
          <div className="arch-layer-card">
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{
                fontSize: 8, fontFamily: 'var(--font-mono)',
                color: layer.color, fontWeight: 700, letterSpacing: '0.07em',
              }}>
                {layer.label}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: layer.statusColor,
                  boxShadow: `0 0 6px ${layer.statusColor}`,
                }} />
                <span style={{
                  fontSize: 7, fontFamily: 'var(--font-mono)',
                  color: layer.statusColor, fontWeight: 600,
                }}>
                  {layer.statusText}
                </span>
              </div>
            </div>

            {/* Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {layer.pills.map(pill => (
                <span
                  key={pill}
                  className="arch-layer-pill"
                  style={{ borderColor: `${layer.color}33`, color: layer.color }}
                >
                  {pill}
                </span>
              ))}
            </div>

            {/* Sub text */}
            {layer.subText && (
              <div style={{
                marginTop: 4, fontSize: 8,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-muted)',
              }}>
                {layer.subText}
              </div>
            )}
          </div>

          {/* Arrow connector between layers */}
          {i < layers.length - 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 14, gap: 4,
            }}>
              <div style={{ width: 1, height: 8, background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize: 7, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                Step {i + 1} →
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
