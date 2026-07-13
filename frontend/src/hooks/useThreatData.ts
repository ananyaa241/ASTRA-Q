'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchThreats, fetchThreatStats, fetchGraphTopology, fetchAuditEntries } from '@/lib/api';
import type { ThreatSession, GraphTopology, AuditEntry, ThreatStats, WSMessage, MetricsPayload } from '@/lib/types';
import { useWebSocket } from './useWebSocket';

const POLL_INTERVAL_MS = 15_000;  // 15s REST fallback polling

export function useThreatData() {
  const [threats, setThreats] = useState<ThreatSession[]>([]);
  const [stats, setStats] = useState<ThreatStats | null>(null);
  const [graph, setGraph] = useState<GraphTopology | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [alerts, setAlerts] = useState<WSMessage[]>([]);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── WebSocket: handle real-time messages ─────────────────────────
  const { status: wsStatus } = useWebSocket({
    onMessage: useCallback((msg: WSMessage) => {
      if (msg.type === 'threat_update') {
        const session: ThreatSession = {
          session_id: msg.session_id,
          user_id: msg.user_id,
          fused_score: msg.fused_score,
          gcn_score: msg.gcn_score,
          transformer_score: msg.transformer_score,
          risk_tier: msg.risk_tier,
          scenario_hints: [msg.scenario],
          inference_latency_ms: msg.inference_latency_ms,
          scored_at: msg.timestamp,
          pqc_signed: msg.pqc_signed,
        };
        setThreats(prev => {
          // Upsert: replace existing session or prepend
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
          p99_latency_ms: msg.p99_latency_ms,
          cache_p99_ms: msg.cache_p99_ms,
          cache_hit_rate: msg.cache_hit_rate,
          events_per_second: msg.events_per_second,
          focal_loss: msg.focal_loss,
        });
      }
    }, []),
  });

  // ── Initial REST load ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [threatData, statsData, graphData, auditData] = await Promise.allSettled([
        fetchThreats({ limit: 50 }),
        fetchThreatStats(),
        fetchGraphTopology({ limit_nodes: 80 }),
        fetchAuditEntries({ limit: 30 }),
      ]);

      if (threatData.status === 'fulfilled') setThreats(threatData.value);
      if (statsData.status === 'fulfilled') setStats(statsData.value);
      if (graphData.status === 'fulfilled') setGraph(graphData.value);
      if (auditData.status === 'fulfilled') setAuditEntries(auditData.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
    refetch: loadAll,
    dismissAlert,
  };
}
