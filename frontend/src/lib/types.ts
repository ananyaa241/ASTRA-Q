// Aegis-Q TypeScript Type Definitions

export type RiskTier = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ThreatSession {
  session_id: string;
  user_id: string;
  fused_score: number;
  gcn_score: number;
  transformer_score: number;
  risk_tier: RiskTier;
  scenario_hints: string[];
  inference_latency_ms: number;
  scored_at: string;
  pqc_signed: boolean;
}

export interface GraphNode {
  id: string;
  type: 'USER' | 'PC' | 'FILE';
  label: string;
  threat_score: number;
  risk_tier: RiskTier;
  properties: Record<string, unknown>;
  // D3 simulation properties (added at runtime)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type: 'logon' | 'copied' | 'emailed' | 'accessed';
  weight: number;
  is_anomalous: boolean;
}

export interface GraphTopology {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count: number;
  edge_count: number;
  anomalous_edge_count: number;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  action_type: string;
  actor: string;
  target_user?: string;
  target_session?: string;
  payload_hash: string;
  pqc_signature_preview: string;
  signing_key_fingerprint: string;
  pqc_algorithm: string;
  is_verified: boolean;
}

export interface MetricsPayload {
  p99_latency_ms: number;
  cache_p99_ms: number;
  cache_hit_rate: number;
  events_per_second: number;
  focal_loss: number;
}

export interface ThreatStats {
  tiers: Array<{
    tier: RiskTier;
    count: number;
    avg_score: number;
    max_score: number;
  }>;
}

// WebSocket message types
export type WSMessage =
  | { type: 'connected'; timestamp: string; message: string }
  | { type: 'threat_update'; timestamp: string } & ThreatSession & { scenario: string }
  | { type: 'alert'; timestamp: string; severity: RiskTier; user_id: string; session_id: string; description: string; score: number }
  | { type: 'metrics'; timestamp: string } & MetricsPayload
  | { type: 'heartbeat'; timestamp: string };

export type AlertMessage = Extract<WSMessage, { type: 'alert' }>;

export interface ContainmentRequest {
  session_id: string;
  user_id: string;
  action: 'ISOLATE' | 'ALERT_ANALYST' | 'LOCK_ACCOUNT' | 'MONITOR_ENHANCED';
  analyst_id: string;
  reason: string;
}

// Named export for ContainmentAction (subset of ContainmentRequest.action)
export type ContainmentAction = 'ISOLATE' | 'LOCK_ACCOUNT' | 'MONITOR_ENHANCED' | 'ALERT_ANALYST';

// Colour utilities
export const TIER_COLORS: Record<RiskTier, { bg: string; text: string; border: string; glow: string }> = {
  CRITICAL: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', border: '#ef4444', glow: '0 0 20px rgba(239,68,68,0.4)' },
  HIGH:     { bg: 'rgba(249,115,22,0.15)', text: '#f97316', border: '#f97316', glow: '0 0 20px rgba(249,115,22,0.35)' },
  MEDIUM:   { bg: 'rgba(234,179,8,0.15)', text: '#eab308', border: '#eab308', glow: '0 0 16px rgba(234,179,8,0.3)' },
  LOW:      { bg: 'rgba(34,197,94,0.10)', text: '#22c55e', border: '#22c55e', glow: '0 0 12px rgba(34,197,94,0.2)' },
};

export const NODE_COLORS: Record<GraphNode['type'], string> = {
  USER:  '#22d3ee',   // cyan
  PC:    '#f59e0b',   // amber
  FILE:  '#f43f5e',   // rose
};
