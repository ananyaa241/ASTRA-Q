// Aegis-Q API Client

import type {
  ThreatSession,
  GraphTopology,
  AuditEntry,
  ThreatStats,
  ContainmentRequest,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Threats ────────────────────────────────────────────────────────
export async function fetchThreats(params?: {
  tier?: string;
  limit?: number;
  offset?: number;
}): Promise<ThreatSession[]> {
  const qs = new URLSearchParams();
  if (params?.tier) qs.set('tier', params.tier);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  return apiFetch<ThreatSession[]>(`/api/threats/?${qs}`);
}

export async function fetchThreatStats(): Promise<ThreatStats> {
  return apiFetch<ThreatStats>('/api/threats/stats');
}

export async function triggerContainment(
  body: ContainmentRequest
): Promise<{ status: string; audit_id: string; pqc_signature: string }> {
  return apiFetch('/api/threats/contain', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ─── Graph ──────────────────────────────────────────────────────────
export async function fetchGraphTopology(params?: {
  user_id?: string;
  min_threat_score?: number;
  limit_nodes?: number;
}): Promise<GraphTopology> {
  const qs = new URLSearchParams();
  if (params?.user_id) qs.set('user_id', params.user_id);
  if (params?.min_threat_score !== undefined)
    qs.set('min_threat_score', String(params.min_threat_score));
  if (params?.limit_nodes) qs.set('limit_nodes', String(params.limit_nodes));
  return apiFetch<GraphTopology>(`/api/graph/topology?${qs}`);
}

// ─── Audit ──────────────────────────────────────────────────────────
export async function fetchAuditEntries(params?: {
  action_type?: string;
  actor?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  const qs = new URLSearchParams();
  if (params?.action_type) qs.set('action_type', params.action_type);
  if (params?.actor) qs.set('actor', params.actor);
  if (params?.limit) qs.set('limit', String(params.limit));
  return apiFetch<AuditEntry[]>(`/api/audit/?${qs}`);
}

export async function verifyAuditEntry(
  entryId: string
): Promise<{ entry_id: string; verified: boolean; algorithm: string }> {
  return apiFetch(`/api/audit/${entryId}/verify`);
}

// ─── Metrics ────────────────────────────────────────────────────────
export async function fetchMetrics(): Promise<{
  inference_latency: {
    p50_ms: number; p95_ms: number; p99_ms: number;
    target_ms: number; within_target: boolean;
  };
  cache_latency: {
    p50_ms: number; p95_ms: number; p99_ms: number;
    target_ms: number; within_target: boolean; hit_rate: number;
  };
  pqc: { kem_algorithm: string; dsa_algorithm: string; mode: string };
}> {
  return apiFetch('/api/metrics');
}

export async function fetchHealth(): Promise<{
  status: string; version: string; cache_p99_ms: number; cache_hit_rate: number;
}> {
  return apiFetch('/health');
}

// ─── Auth ────────────────────────────────────────────────────────────

export interface AuthResponseData {
  status: string;
  message: string;
  risk_tier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  fused_score: number;
}

/**
 * Request access to ASTRA-Q. Pass totpCode for the MFA step.
 * On 401/403 the fetch will throw — callers should use raw fetch and
 * handle error statuses themselves (see LoginFormWithPasswordCapture).
 */
export async function requestAccess(
  userId: string,
  password: string,
  totpCode?: string,
): Promise<AuthResponseData> {
  return apiFetch<AuthResponseData>('/api/auth/request-access', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, password, totp_code: totpCode ?? null }),
  });
}

