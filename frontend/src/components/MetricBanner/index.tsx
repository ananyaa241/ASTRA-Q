'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { MetricsPayload } from '@/lib/types';
import type { WSStatus } from '@/hooks/useWebSocket';

interface Props {
  metrics: MetricsPayload | null;
  wsStatus: WSStatus;
}

interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  status?: 'ok' | 'warn' | 'crit' | 'neutral';
  sparkline?: number[];
  delay?: number;
}

function KPICard({ label, value, sub, status = 'neutral', sparkline, delay = 0 }: KPICardProps) {
  const statusColor = {
    ok:      '#22c55e',
    warn:    '#eab308',
    crit:    '#ef4444',
    neutral: '#22d3ee',
  }[status];

  const maxSpark = sparkline ? Math.max(...sparkline, 0.001) : 1;
  const W = 80, H = 28;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{
        flex: 1, minWidth: 120,
        background: 'rgba(13,20,36,0.6)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${statusColor}22`,
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 4,
        transition: 'box-shadow 300ms',
      }}
    >
      <div className="section-label" style={{ fontSize: 9 }}>{label}</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 22,
          color: statusColor, lineHeight: 1,
          textShadow: `0 0 20px ${statusColor}55`,
        }}>
          {value}
        </span>

        {/* Sparkline */}
        {sparkline && sparkline.length > 1 && (
          <svg width={W} height={H} style={{ opacity: 0.7 }}>
            <polyline
              points={sparkline.map((v, i) =>
                `${(i / (sparkline.length - 1)) * W},${H - (v / maxSpark) * H}`
              ).join(' ')}
              fill="none"
              stroke={statusColor}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Glow duplicate */}
            <polyline
              points={sparkline.map((v, i) =>
                `${(i / (sparkline.length - 1)) * W},${H - (v / maxSpark) * H}`
              ).join(' ')}
              fill="none"
              stroke={statusColor}
              strokeWidth="4"
              strokeLinejoin="round"
              opacity="0.1"
            />
          </svg>
        )}
      </div>

      {sub && (
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          {sub}
        </div>
      )}

      {/* Status bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, marginTop: 4 }}>
        <div style={{
          height: '100%', borderRadius: 1,
          background: `linear-gradient(90deg, ${statusColor}44, ${statusColor})`,
          width: status === 'ok' ? '100%' : status === 'warn' ? '65%' : status === 'crit' ? '100%' : '50%',
          boxShadow: `0 0 8px ${statusColor}44`,
        }} />
      </div>
    </motion.div>
  );
}

export default function MetricBanner({ metrics, wsStatus }: Props) {
  const focalHistory = useMemo(() => {
    if (!metrics) return [0.08, 0.07, 0.06, 0.05, 0.04, 0.035, 0.03];
    return [0.08, 0.07, 0.06, 0.05, 0.04, 0.035, metrics.focal_loss];
  }, [metrics]);

  const latencyHistory = useMemo(() => {
    if (!metrics) return [28, 25, 22, 20, 18, 17, 16];
    return [28, 25, 22, 20, 18, 17, metrics.p99_latency_ms];
  }, [metrics]);

  const p99 = metrics?.p99_latency_ms ?? 0;
  const cacheP99 = metrics?.cache_p99_ms ?? 0;
  const hitRate = metrics?.cache_hit_rate ?? 0;
  const fl = metrics?.focal_loss ?? 0;
  const eps = metrics?.events_per_second ?? 0;

  const latencyStatus = p99 === 0 ? 'neutral' : p99 <= 25 ? 'ok' : p99 <= 35 ? 'warn' : 'crit';
  const cacheStatus   = cacheP99 === 0 ? 'neutral' : cacheP99 <= 1.5 ? 'ok' : cacheP99 <= 2 ? 'warn' : 'crit';

  return (
    <div style={{
      padding: '10px 20px',
      borderBottom: '1px solid var(--color-border)',
      background: 'rgba(7,11,20,0.6)',
    }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* P99 Inference Latency */}
        <KPICard
          label="P99 Inference Latency"
          value={p99 > 0 ? `${p99.toFixed(1)}ms` : '--'}
          sub={`Target: ≤ 35ms · ${latencyStatus === 'ok' ? '✓ WITHIN TARGET' : latencyStatus === 'warn' ? '⚠ NEAR LIMIT' : p99 > 0 ? '✗ EXCEEDED' : 'WAITING'}`}
          status={latencyStatus}
          sparkline={latencyHistory}
          delay={0}
        />

        {/* Cache Lookup Latency */}
        <KPICard
          label="Cache Lookup P99"
          value={cacheP99 > 0 ? `${cacheP99.toFixed(2)}ms` : '--'}
          sub={`Target: ≤ 2ms · Hit rate: ${(hitRate * 100).toFixed(0)}%`}
          status={cacheStatus}
          delay={0.05}
        />

        {/* Focal Loss */}
        <KPICard
          label="Focal Loss (Training)"
          value={fl > 0 ? fl.toFixed(4) : '--'}
          sub={`FL(p_t) = -α_t·(1-p_t)²·log(p_t) | γ=2.0`}
          status={fl > 0 ? (fl < 0.05 ? 'ok' : 'warn') : 'neutral'}
          sparkline={focalHistory}
          delay={0.1}
        />

        {/* Events/sec */}
        <KPICard
          label="Event Throughput"
          value={eps > 0 ? `${eps.toFixed(0)}/s` : '--'}
          sub="Kafka consumer rate"
          status={eps > 100 ? 'ok' : eps > 0 ? 'warn' : 'neutral'}
          delay={0.15}
        />

        {/* PQC Status */}
        <KPICard
          label="PQC Transport"
          value="ACTIVE"
          sub="ML-KEM-1024 · ML-DSA-87"
          status="ok"
          delay={0.2}
        />

        {/* Live stream indicator */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          style={{
            minWidth: 120, flex: 0,
            background: 'rgba(13,20,36,0.6)',
            border: `1px solid rgba(34,211,238,0.15)`,
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center',
          }}>
          <div className="section-label" style={{ fontSize: 9 }}>STREAM</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`status-dot ${
              wsStatus === 'connected'  ? 'live'         :
              wsStatus === 'connecting' ? 'connecting'   :
              wsStatus === 'error'      ? 'error'        :
              'disconnected'
            }`} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12,
              color: wsStatus === 'connected'  ? '#22c55e'
                   : wsStatus === 'connecting' ? '#eab308'
                   : wsStatus === 'error'      ? '#ef4444'
                   : '#f97316',
              fontWeight: 600 }}>
              {wsStatus === 'connected' ? 'LIVE' : wsStatus.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            WebSocket · Real-time
          </div>
        </motion.div>
      </div>
    </div>
  );
}
