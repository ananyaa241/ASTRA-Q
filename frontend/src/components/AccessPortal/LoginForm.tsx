'use client';
import { useState, useEffect } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthSuccessData {
  risk_tier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  fused_score: number;
  status: string;
  message: string;
}

interface Props {
  onSuccess: (data: AuthSuccessData) => void;
  onMfaRequired: (userId: string) => void;
  onCriticalDenied: () => void;
}

// ─── Risk Evaluation Stepper ─────────────────────────────────────────────────

type StepStatus = 'pending' | 'active' | 'complete';

interface EvalStep {
  label: string;
  status: StepStatus;
}

const STEP_COLORS: Record<StepStatus, string> = {
  pending:  'var(--color-text-muted)',
  active:   'var(--color-cyan)',
  complete: 'var(--color-low)',
};

function RiskEvalStepper({ steps }: { steps: EvalStep[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
            border: `1.5px solid ${STEP_COLORS[s.status]}`,
            background: s.status === 'complete' ? STEP_COLORS.complete : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 300ms',
          }}>
            {s.status === 'complete' && (
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#04070d" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
            {s.status === 'active' && (
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--color-cyan)',
                animation: 'eval-pulse 1s ease-in-out infinite',
              }} />
            )}
          </div>
          <span style={{
            fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
            color: STEP_COLORS[s.status], whiteSpace: 'nowrap',
            transition: 'color 300ms',
          }}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 1,
              background: s.status === 'complete' ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)',
              transition: 'background 300ms', marginLeft: 4,
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── LoginForm ────────────────────────────────────────────────────────────────

// Use relative path → Next.js rewrites /api/* to http://localhost:8000/api/* (no CORS)
const AUTH_URL = '/api/auth/request-access';

export default function LoginForm({ onSuccess, onMfaRequired, onCriticalDenied }: Props) {
  const [userId, setUserId]       = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // Risk evaluation stepper state
  const [evalSteps, setEvalSteps] = useState<EvalStep[]>([
    { label: 'Identity Submitted',       status: 'pending' },
    { label: 'Evaluating Risk Profile...',status: 'pending' },
    { label: 'Awaiting Authorization',   status: 'pending' },
  ]);

  // Reset stepper when not loading
  useEffect(() => {
    if (!loading) {
      setEvalSteps([
        { label: 'Identity Submitted',       status: 'pending' },
        { label: 'Evaluating Risk Profile...',status: 'pending' },
        { label: 'Awaiting Authorization',   status: 'pending' },
      ]);
    }
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Step 1 — identity submitted after 200ms
    setTimeout(() => {
      setEvalSteps(prev => [
        { ...prev[0], status: 'complete' },
        { ...prev[1], status: 'active' },
        { ...prev[2], status: 'pending' },
      ]);
    }, 200);

    // Step 3 — awaiting authorization appears while waiting
    setTimeout(() => {
      setEvalSteps(prev => [
        { ...prev[0], status: 'complete' },
        { ...prev[1], status: 'active' },
        { ...prev[2], status: 'active' },
      ]);
    }, 800);

    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, password, totp_code: null }),
      });

      const data: Record<string, unknown> = await res.json();

      if (res.status === 200) {
        onSuccess(data as unknown as AuthSuccessData);
      } else if (res.status === 403) {
        onCriticalDenied();
      } else if (res.status === 401) {
        const detail = (data.detail as string) ?? '';
        if (detail.startsWith('MFA Required')) {
          onMfaRequired(userId);
        } else {
          setError(detail || 'Authentication failed. Check credentials.');
        }
      } else {
        setError((data.detail as string) || 'Unexpected response from gateway.');
      }
    } catch {
      setError('Unable to reach ASTRA-Q gateway. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (isFocused: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '14px 16px',
    background: isFocused ? 'rgba(7,11,20,0.95)' : 'rgba(7,11,20,0.6)',
    border: `1px solid ${isFocused ? 'rgba(34,211,238,0.6)' : 'rgba(255,255,255,0.1)'}`,
    color: '#fff',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.3s ease',
    boxShadow: isFocused ? '0 0 15px rgba(34,211,238,0.15)' : 'none',
    fontFamily: 'var(--font-mono, monospace)',
    boxSizing: 'border-box',
  });

  return (
    <div style={{
      padding: '40px',
      width: '100%',
      maxWidth: '440px',
      margin: '0 auto',
      background: 'rgba(7,11,20,0.4)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(34,211,238,0.2)',
      borderRadius: '16px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '48px', height: '48px', borderRadius: '12px',
          background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)',
          marginBottom: '16px', boxShadow: '0 0 20px rgba(34,211,238,0.2)',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan, #22d3ee)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '700', letterSpacing: '-0.5px', marginBottom: '8px' }}>ASTRA-Q Gateway</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', letterSpacing: '0.2px' }}>Authenticate to access PQC-secured target resources.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '600', marginBottom: '8px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Operator ID</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onFocus={() => setFocusedInput('user')}
            onBlur={() => setFocusedInput(null)}
            style={inputStyle(focusedInput === 'user')}
            placeholder="USR1771"
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '600', marginBottom: '8px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Passphrase</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setFocusedInput('password')}
            onBlur={() => setFocusedInput(null)}
            style={inputStyle(focusedInput === 'password')}
            placeholder="••••••••••••"
            required
          />
        </div>

        {error && (
          <div style={{
            color: '#ef4444', fontSize: '13px', background: 'rgba(239,68,68,0.1)',
            padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '12px', padding: '16px', background: 'linear-gradient(90deg, #22d3ee, #6366f1)',
            color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px',
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.8 : 1,
            transition: 'all 0.3s ease', boxShadow: '0 4px 15px rgba(34,211,238,0.3)',
          }}
          onMouseOver={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(34,211,238,0.4)'; } }}
          onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(34,211,238,0.3)'; }}
        >
          {loading ? 'ANALYZING RISK METRICS...' : 'INITIATE SECURE SESSION'}
        </button>

        {/* Risk evaluation stepper — shown only when loading */}
        {loading && <RiskEvalStepper steps={evalSteps} />}
      </form>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes eval-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.7)} }
      `}} />
    </div>
  );
}
