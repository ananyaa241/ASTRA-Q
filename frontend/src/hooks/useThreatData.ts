'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchThreats, fetchThreatStats, fetchGraphTopology, fetchAuditEntries } from '@/lib/api';
import type {
  ThreatSession, GraphTopology, AuditEntry,
  ThreatStats, WSMessage, MetricsPayload,
} from '@/lib/types';
import { useWebSocket } from './useWebSocket';

const POLL_INTERVAL_MS = 15_000;

// ─── Synthetic demo data (shown when API is unavailable) ────────────
const DEMO_THREATS: ThreatSession[] = [
  { session_id: 'sess-001', user_id: 'ACM2278', fused_score: 0.94, gcn_score: 0.91, transformer_score: 0.96, risk_tier: 'CRITICAL', scenario_hints: ['After-hours Wikileaks upload', 'Removable device connected'], inference_latency_ms: 22.4, scored_at: new Date().toISOString(), pqc_signed: true },
  { session_id: 'sess-002', user_id: 'PFM3190', fused_score: 0.81, gcn_score: 0.79, transformer_score: 0.83, risk_tier: 'HIGH', scenario_hints: ['Job search keywords + thumb drive exfil'], inference_latency_ms: 18.7, scored_at: new Date().toISOString(), pqc_signed: true },
  { session_id: 'sess-003', user_id: 'TRM1456', fused_score: 0.77, gcn_score: 0.74, transformer_score: 0.79, risk_tier: 'HIGH', scenario_hints: ['Cross-machine login detected', 'Email exfiltration pattern'], inference_latency_ms: 19.1, scored_at: new Date().toISOString(), pqc_signed: true },
  { session_id: 'sess-004', user_id: 'BEW0534', fused_score: 0.68, gcn_score: 0.65, transformer_score: 0.71, risk_tier: 'HIGH', scenario_hints: ['Dropbox uploads increasing'], inference_latency_ms: 21.3, scored_at: new Date().toISOString(), pqc_signed: true },
  { session_id: 'sess-005', user_id: 'KLT2901', fused_score: 0.55, gcn_score: 0.52, transformer_score: 0.58, risk_tier: 'MEDIUM', scenario_hints: ['Suspicious file hex header (PE in .txt)'], inference_latency_ms: 16.9, scored_at: new Date().toISOString(), pqc_signed: false },
  { session_id: 'sess-006', user_id: 'MNR0817', fused_score: 0.48, gcn_score: 0.45, transformer_score: 0.51, risk_tier: 'MEDIUM', scenario_hints: ['Weekend device connect spike'], inference_latency_ms: 17.8, scored_at: new Date().toISOString(), pqc_signed: true },
  { session_id: 'sess-007', user_id: 'ZKP1123', fused_score: 0.32, gcn_score: 0.30, transformer_score: 0.34, risk_tier: 'LOW', scenario_hints: ['Baseline deviation: email count'], inference_latency_ms: 15.2, scored_at: new Date().toISOString(), pqc_signed: true },
  { session_id: 'sess-008', user_id: 'WQV4472', fused_score: 0.21, gcn_score: 0.19, transformer_score: 0.23, risk_tier: 'LOW', scenario_hints: [], inference_latency_ms: 14.8, scored_at: new Date().toISOString(), pqc_signed: false },
];

const DEMO_STATS: ThreatStats = {
  tiers: [
    { tier: 'CRITICAL', count: 1, avg_score: 0.94, max_score: 0.94 },
    { tier: 'HIGH',     count: 3, avg_score: 0.75, max_score: 0.81 },
    { tier: 'MEDIUM',   count: 2, avg_score: 0.51, max_score: 0.55 },
    { tier: 'LOW',      count: 2, avg_score: 0.27, max_score: 0.32 },
  ],
};

const DEMO_GRAPH: GraphTopology = {
  nodes: [
    { id: 'ACM2278', type: 'USER', label: 'ACM2278', threat_score: 0.94, risk_tier: 'CRITICAL', properties: {} },
    { id: 'PFM3190', type: 'USER', label: 'PFM3190', threat_score: 0.81, risk_tier: 'HIGH', properties: {} },
    { id: 'TRM1456', type: 'USER', label: 'TRM1456', threat_score: 0.77, risk_tier: 'HIGH', properties: {} },
    { id: 'BEW0534', type: 'USER', label: 'BEW0534', threat_score: 0.68, risk_tier: 'HIGH', properties: {} },
    { id: 'KLT2901', type: 'USER', label: 'KLT2901', threat_score: 0.55, risk_tier: 'MEDIUM', properties: {} },
    { id: 'MNR0817', type: 'USER', label: 'MNR0817', threat_score: 0.48, risk_tier: 'MEDIUM', properties: {} },
    { id: 'PC-001',  type: 'PC',   label: 'PC-001',  threat_score: 0.85, risk_tier: 'CRITICAL', properties: {} },
    { id: 'PC-002',  type: 'PC',   label: 'PC-002',  threat_score: 0.60, risk_tier: 'MEDIUM', properties: {} },
    { id: 'PC-003',  type: 'PC',   label: 'PC-003',  threat_score: 0.30, risk_tier: 'LOW', properties: {} },
    { id: 'FILE-A',  type: 'FILE', label: 'keylog.txt', threat_score: 0.95, risk_tier: 'CRITICAL', properties: {} },
    { id: 'FILE-B',  type: 'FILE', label: 'docs.zip', threat_score: 0.55, risk_tier: 'MEDIUM', properties: {} },
  ],
  edges: [
    { id: 'e1', source: 'ACM2278', target: 'PC-001', type: 'logon',   weight: 5, is_anomalous: true },
    { id: 'e2', source: 'ACM2278', target: 'FILE-A', type: 'copied',  weight: 3, is_anomalous: true },
    { id: 'e3', source: 'PFM3190', target: 'PC-001', type: 'logon',   weight: 2, is_anomalous: true },
    { id: 'e4', source: 'TRM1456', target: 'PC-002', type: 'accessed',weight: 1, is_anomalous: false },
    { id: 'e5', source: 'TRM1456', target: 'FILE-B', type: 'emailed', weight: 2, is_anomalous: true },
    { id: 'e6', source: 'KLT2901', target: 'PC-003', type: 'logon',   weight: 1, is_anomalous: false },
    { id: 'e7', source: 'BEW0534', target: 'PC-002', type: 'logon',   weight: 1, is_anomalous: false },
    { id: 'e8', source: 'MNR0817', target: 'PC-003', type: 'accessed',weight: 1, is_anomalous: false },
  ],
  node_count: 11,
  edge_count: 8,
  anomalous_edge_count: 4,
};

const DEMO_AUDIT: AuditEntry[] = [
  { id: 'a1', created_at: new Date(Date.now() - 60000).toISOString(), action_type: 'ALERT_GENERATED', actor: 'SYSTEM', target_user: 'ACM2278', target_session: 'sess-001', payload_hash: 'sha3:a1b2c3d4e5f6...', pqc_signature_preview: 'ML-DSA-87:4595B:AAAB...', signing_key_fingerprint: 'fp:22d3ee...', pqc_algorithm: 'ML-DSA-87', is_verified: true },
  { id: 'a2', created_at: new Date(Date.now() - 120000).toISOString(), action_type: 'CONTAINMENT_TRIGGERED', actor: 'analyst_soc', target_user: 'PFM3190', target_session: 'sess-002', payload_hash: 'sha3:b2c3d4e5f6a1...', pqc_signature_preview: 'ML-DSA-87:4595B:BBBC...', signing_key_fingerprint: 'fp:f59e0b...', pqc_algorithm: 'ML-DSA-87', is_verified: true },
  { id: 'a3', created_at: new Date(Date.now() - 300000).toISOString(), action_type: 'SYSTEM_START', actor: 'SYSTEM', payload_hash: 'sha3:c3d4e5f6a1b2...', pqc_signature_preview: 'ML-DSA-87:4595B:CCCD...', signing_key_fingerprint: 'fp:a5b4fc...', pqc_algorithm: 'ML-DSA-87', is_verified: true },
];

// ────────────────────────────────────────────────────────────────────

export function useThreatData() {
  const [threats, setThreats]         = useState<ThreatSession[]>(DEMO_THREATS);
  const [stats, setStats]             = useState<ThreatStats | null>(DEMO_STATS);
  const [graph, setGraph]             = useState<GraphTopology | null>(DEMO_GRAPH);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(DEMO_AUDIT);
  const [alerts, setAlerts]           = useState<WSMessage[]>([]);
  const [metrics, setMetrics]         = useState<MetricsPayload | null>(null);
  const [loading, setLoading]         = useState(false); // demo data is pre-loaded
  const [error, setError]             = useState<string | null>(null);
  const [usingDemo, setUsingDemo]     = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── WebSocket: handle real-time messages ─────────────────────────
  const { status: wsStatus } = useWebSocket({
    onMessage: useCallback((msg: WSMessage) => {
      if (msg.type === 'threat_update') {
        // Switch away from demo data once real data arrives
        setUsingDemo(false);
        const session: ThreatSession = {
          session_id:        msg.session_id,
          user_id:           msg.user_id,
          fused_score:       msg.fused_score,
          gcn_score:         msg.gcn_score,
          transformer_score: msg.transformer_score,
          risk_tier:         msg.risk_tier,
          scenario_hints:    [msg.scenario],
          inference_latency_ms: msg.inference_latency_ms,
          scored_at:         msg.timestamp,
          pqc_signed:        msg.pqc_signed,
        };
        setThreats(prev => {
          const idx = prev.findIndex(t => t.user_id === session.user_id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = session;
            return next.sort((a, b) => b.fused_score - a.fused_score);
          }
          return [session, ...prev].slice(0, 100).sort((a, b) => b.fused_score - a.fused_score);
        });
      } else if (msg.type === 'alert') {
        setAlerts(prev => [msg, ...prev].slice(0, 50));
      } else if (msg.type === 'metrics') {
        setMetrics({
          p99_latency_ms:   msg.p99_latency_ms,
          cache_p99_ms:     msg.cache_p99_ms,
          cache_hit_rate:   msg.cache_hit_rate,
          events_per_second: msg.events_per_second,
          focal_loss:       msg.focal_loss,
        });
      }
    }, []),
  });

  // ── REST load (real API) ──────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [threatData, statsData, graphData, auditData] = await Promise.allSettled([
        fetchThreats({ limit: 50 }),
        fetchThreatStats(),
        fetchGraphTopology({ limit_nodes: 80 }),
        fetchAuditEntries({ limit: 30 }),
      ]);

      // Only overwrite demo data if at least threats resolved with real rows
      const gotReal = threatData.status === 'fulfilled' && threatData.value.length > 0;
      if (gotReal) {
        setUsingDemo(false);
        setThreats(threatData.value);
      }
      if (statsData.status  === 'fulfilled') setStats(statsData.value);
      if (graphData.status  === 'fulfilled' && graphData.value.node_count > 0) setGraph(graphData.value);
      if (auditData.status  === 'fulfilled') setAuditEntries(auditData.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Attempt real API load immediately
    loadAll();
    // REST poll fallback when WS is disconnected
    pollRef.current = setInterval(() => {
      if (wsStatus !== 'connected') loadAll();
    }, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadAll, wsStatus]);

  const dismissAlert = useCallback((idx: number) => {
    setAlerts(prev => prev.filter((_, i) => i !== idx));
  }, []);

  return {
    threats,
    stats,
    graph,
    auditEntries,
    alerts,
    metrics,
    loading,
    error,
    wsStatus,
    usingDemo,
    refetch: loadAll,
    dismissAlert,
  };
}
