'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import LoginForm from '@/components/AccessPortal/LoginForm';
import MfaChallenge from '@/components/AccessPortal/MfaChallenge';
import CriticalDenial from '@/components/AccessPortal/CriticalDenial';
import type { AuthSuccessData } from '@/components/AccessPortal/LoginForm';

// ─── Workflow Stepper ─────────────────────────────────────────────────────────

type StepState = 'pending' | 'active' | 'complete' | 'alert';

interface WorkflowStep {
  label: string;
  state: StepState;
}

const STATE_COLOR: Record<StepState, string> = {
  pending: '#4a5568',
  active: '#22d3ee',
  complete: '#22c55e',
  alert: '#ef4444',
};

function AccessWorkflowStepper({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      marginBottom: '32px', padding: '12px 20px',
      background: 'transparent',
      borderBottom: '1px solid rgba(0,0,0,0.1)',
    }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          {/* Circle */}
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            border: `2px solid ${STATE_COLOR[s.state]}`,
            background: s.state === 'complete' ? STATE_COLOR.complete
              : s.state === 'alert' ? STATE_COLOR.alert
                : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 300ms',
            boxShadow: s.state === 'active' ? `0 0 12px ${STATE_COLOR.active}88` : 'none',
            animation: s.state === 'active' ? 'step-pulse 1.5s ease-in-out infinite' : 'none',
          }}>
            {s.state === 'complete' && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#04070d" strokeWidth="3.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {s.state === 'alert' && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </div>
          {/* Label */}
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: STATE_COLOR[s.state], marginLeft: 8, whiteSpace: 'nowrap',
            transition: 'color 300ms', fontWeight: s.state === 'active' ? 500 : 400,
          }}>{s.label}</span>
          {/* Connector */}
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 1, marginLeft: 8, marginRight: 8,
              background: s.state === 'complete' ? 'rgba(34,197,94,0.4)' : 'rgba(0,0,0,0.1)',
              transition: 'background 400ms',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Access Portal Page ───────────────────────────────────────────────────────

type AuthState = 'login' | 'mfa' | 'critical_denied' | 'success';

export default function AccessPortalPage() {
  const router = useRouter();
  const { setSession } = useAuth();

  const [authState, setAuthState] = useState<AuthState>('login');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // ── Workflow steps derived from authState ──
  const workflowSteps: WorkflowStep[] = [
    {
      label: 'Access Request',
      state: authState === 'login' ? 'active' : 'complete',
    },
    {
      label: 'Risk Evaluation',
      state: authState === 'login'
        ? 'pending'
        : authState === 'critical_denied'
          ? 'alert'
          : authState === 'success'
            ? 'complete'
            : 'complete',
    },
    {
      label: 'Identity Verification',
      state: authState === 'mfa'
        ? 'active'
        : authState === 'success'
          ? 'complete'
          : 'pending',
    },
  ];

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLoginSuccess = (data: AuthSuccessData) => {
    const newSession = {
      userId,
      riskTier: data.risk_tier,
      fusedScore: data.fused_score,
      isAuthenticated: true,
      analystId: `analyst_${userId.toLowerCase()}`,
    };
    setSession(newSession);
    setAuthState('success');
    router.push('/dashboard');
  };

  const handleMfaRequired = (uid: string) => {
    setUserId(uid);
    setAuthState('mfa');
  };

  const handleCriticalDenied = () => {
    setAuthState('critical_denied');
  };

  const handleMfaSuccess = (data: AuthSuccessData) => {
    const newSession = {
      userId,
      riskTier: data.risk_tier,
      fusedScore: data.fused_score,
      isAuthenticated: true,
      analystId: `analyst_${userId.toLowerCase()}`,
    };
    setSession(newSession);
    setAuthState('success');
    router.push('/dashboard');
  };

  // Capture password from the form before submission
  // We do this by intercepting the form's password state via a prop or shared state.
  // LoginForm calls onMfaRequired(userId) — we also need password.
  // We capture it via the LoginForm's onMfaRequired callback which receives userId;
  // the password is passed via a wrapper that tracks the current form password.
  // Solution: track password in this page's state, pass setter down.

  if (!mounted) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: '#f8fafc', zIndex: 1,
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      color: '#0f172a',
    }}>
      {/* Extreme smooth ambient lighting */}
      <div style={{ position: 'absolute', top: '10%', left: '30%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(255,255,255,0) 70%)', filter: 'blur(100px)', zIndex: -1 }} />

      <div style={{ width: '100%', maxWidth: '520px', padding: '20px 20px' }}>
        {/* Workflow stepper at top */}
        <AccessWorkflowStepper steps={workflowSteps} />

        {/* Auth card */}
        {authState === 'login' && (
          <div style={{ animation: 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <LoginFormWrapper
              onSuccess={handleLoginSuccess}
              onMfaRequired={(uid, pwd) => {
                setUserId(uid);
                setPassword(pwd);
                handleMfaRequired(uid);
              }}
              onCriticalDenied={handleCriticalDenied}
            />
          </div>
        )}

        {authState === 'mfa' && (
          <div style={{ animation: 'zoom-in 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <MfaChallenge
              userId={userId}
              password={password}
              onSuccess={handleMfaSuccess}
              onCancel={() => setAuthState('login')}
            />
          </div>
        )}

        {authState === 'critical_denied' && (
          <div style={{ animation: 'zoom-in 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <CriticalDenial onBack={() => setAuthState('login')} />
          </div>
        )}

        {/* authState === 'success' shows nothing — router.push fires immediately */}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fade-up { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes zoom-in { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes step-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.2)} }
      `}} />
    </div>
  );
}

// ─── LoginForm Wrapper ────────────────────────────────────────────────────────
// Intercepts onMfaRequired to capture the password state.

interface WrapperProps {
  onSuccess: (data: AuthSuccessData) => void;
  onMfaRequired: (userId: string, password: string) => void;
  onCriticalDenied: () => void;
}

function LoginFormWrapper({ onSuccess, onMfaRequired, onCriticalDenied }: WrapperProps) {
  // We maintain password state here and pass the captured value to the MFA step.
  // The inner LoginForm manages its own password input; we track it via a ref approach.
  // Since LoginForm calls onMfaRequired(userId) — we need password.
  // Solution: intercept at this layer using a shared state via a custom hook pattern.

  const [capturedPassword, setCapturedPassword] = useState('');

  return (
    <LoginFormWithPasswordCapture
      onSuccess={onSuccess}
      onMfaRequired={(uid) => onMfaRequired(uid, capturedPassword)}
      onCriticalDenied={onCriticalDenied}
      onPasswordChange={setCapturedPassword}
    />
  );
}

interface LoginFormWithCaptureProps {
  onSuccess: (data: AuthSuccessData) => void;
  onMfaRequired: (userId: string) => void;
  onCriticalDenied: () => void;
  onPasswordChange: (pwd: string) => void;
}

function LoginFormWithPasswordCapture({ onSuccess, onMfaRequired, onCriticalDenied, onPasswordChange }: LoginFormWithCaptureProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [evalStep, setEvalStep] = useState(0); // 0=none, 1=submitted, 2=evaluating, 3=authorizing

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    onPasswordChange(val);
  };

  // Use relative path → Next.js rewrites /api/* to http://localhost:8000/api/* (no CORS)
  const AUTH_URL = '/api/auth/request-access';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setEvalStep(1);

    const t1 = setTimeout(() => setEvalStep(2), 200);
    const t2 = setTimeout(() => setEvalStep(3), 800);

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
      clearTimeout(t1); clearTimeout(t2);
      setLoading(false);
      setEvalStep(0);
    }
  };

  const inputStyle = (isFocused: boolean): React.CSSProperties => ({
    width: '100%', padding: '14px 16px',
    background: '#ffffff',
    border: `1px solid ${isFocused ? 'rgba(16,185,129,0.5)' : 'rgba(0,0,0,0.1)'}`,
    color: '#0f172a', borderRadius: '6px', fontSize: '14px', outline: 'none',
    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    boxShadow: isFocused ? '0 0 0 1px rgba(16,185,129,0.3)' : 'none',
    fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
    letterSpacing: '0.02em',
  });

  const evalLabels = ['Identity Submitted', 'Evaluating Risk Profile...', 'Awaiting Authorization'];
  const stepColors = ['#22c55e', '#22d3ee', '#22d3ee'];

  return (
    <div style={{
      padding: '48px 40px', width: '100%', maxWidth: '420px', margin: '0 auto',
      background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      border: '1px solid rgba(0,0,0,0.06)', borderRadius: '12px',
      boxShadow: '0 24px 48px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '40px', height: '40px', borderRadius: '8px',
          background: '#0f172a',
          marginBottom: '20px', boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: '#0f172a', fontSize: '22px', fontWeight: '500', letterSpacing: '-0.03em', marginBottom: '8px' }}>Astra-Q Gateway</h2>
        <p style={{ color: 'rgba(0,0,0,0.5)', fontSize: '13px', fontWeight: 400, letterSpacing: '0.01em' }}>Authenticate to access PQC-secured target resources.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <label style={{ display: 'block', color: 'rgba(0,0,0,0.6)', fontSize: '11px', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Operator ID</label>
          <input type="text" value={userId} onChange={e => setUserId(e.target.value)}
            onFocus={() => setFocusedInput('user')} onBlur={() => setFocusedInput(null)}
            style={inputStyle(focusedInput === 'user')} placeholder="usr_priv_001" required />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <label style={{ color: 'rgba(0,0,0,0.6)', fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Passphrase</label>
          </div>
          <input type="password" value={password} onChange={e => handlePasswordChange(e.target.value)}
            onFocus={() => setFocusedInput('password')} onBlur={() => setFocusedInput(null)}
            style={inputStyle(focusedInput === 'password')} placeholder="••••••••••••" required />
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '13px', background: 'rgba(239,68,68,0.1)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          marginTop: '16px', padding: '14px', background: '#10b981',
          color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', letterSpacing: '0.01em',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
          onMouseOver={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(255,255,255,0.15)'; } }}
          onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          {loading ? 'ANALYZING RISK METRICS...' : 'INITIATE SECURE SESSION'}
        </button>

        {/* Eval stepper shown when loading */}
        {loading && evalStep > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
            {evalLabels.map((label, i) => {
              const done = i + 1 < evalStep;
              const active = i + 1 === evalStep;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: `1.5px solid ${done ? '#22c55e' : active ? stepColors[i] : '#4a5568'}`,
                    background: done ? '#22c55e' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 250ms',
                  }}>
                    {done && <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#04070d" strokeWidth="3.5"><polyline points="20 6 9 17 4 12" /></svg>}
                    {active && <div style={{ width: 5, height: 5, borderRadius: '50%', background: stepColors[i], animation: 'eval-pulse 1s infinite' }} />}
                  </div>
                  <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: done ? '#22c55e' : active ? stepColors[i] : '#4a5568', whiteSpace: 'nowrap' }}>{label}</span>
                  {i < evalLabels.length - 1 && <div style={{ flex: 1, height: 1, background: done ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.06)' }} />}
                </div>
              );
            })}
          </div>
        )}
      </form>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes eval-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.7)} }
      `}} />
    </div>
  );
}
