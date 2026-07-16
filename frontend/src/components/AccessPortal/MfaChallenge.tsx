'use client';
import { useState } from 'react';
import type { AuthSuccessData } from './LoginForm';

interface Props {
  userId: string;        // operator ID — re-sent to the same endpoint
  password: string;      // original password — re-sent to backend for re-auth with totp
  onSuccess: (data: AuthSuccessData) => void;
  onCancel: () => void;
}

// Use relative path → Next.js rewrites /api/* to http://localhost:8000/api/* (no CORS)
const AUTH_URL = '/api/auth/request-access';

export default function MfaChallenge({ userId, password, onSuccess, onCancel }: Props) {
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Re-call the same endpoint — this time with totp_code
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, password, totp_code: totp }),
      });

      const data: Record<string, unknown> = await res.json();

      if (res.status === 200) {
        onSuccess(data as unknown as AuthSuccessData);
      } else {
        const detail = (data.detail as string) ?? '';
        if (detail.includes('Invalid MFA')) {
          setError('Cryptographic verification failed. Invalid token.');
        } else {
          setError(detail || 'Verification failed. Please try again.');
        }
      }
    } catch {
      setError('Unable to reach ASTRA-Q gateway. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      padding: '40px',
      width: '100%',
      maxWidth: '440px',
      margin: '0 auto',
      background: 'rgba(255,255,255,0.8)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(0,0,0,0.1)',
      borderRadius: '16px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.05), inset 0 0 80px rgba(245,158,11,0.02)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)',
          marginBottom: '16px', animation: 'pulse-amber 2s infinite',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h2 style={{ color: '#d97706', fontSize: '24px', fontWeight: '700', letterSpacing: '-0.5px', marginBottom: '8px' }}>Identity Verification</h2>
        <p style={{ color: 'rgba(0,0,0,0.6)', fontSize: '13px', lineHeight: '1.5' }}>
          Anomaly detected in behavioral telemetry. Please provide your multi-factor authenticator code to proceed.
        </p>
        {/* Operator context */}
        <p style={{ marginTop: 8, color: 'rgba(2,132,199,0.9)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
          Operator: {userId}
        </p>
      </div>

      <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <input
            type="text"
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              width: '100%', padding: '20px',
              background: focused ? '#ffffff' : 'rgba(0,0,0,0.02)',
              border: `1px solid ${focused ? '#f59e0b' : 'rgba(0,0,0,0.15)'}`,
              color: '#d97706', borderRadius: '8px',
              fontSize: '32px', letterSpacing: '0.4em', textAlign: 'center',
              fontWeight: '700', outline: 'none',
              transition: 'all 0.3s ease',
              boxShadow: focused ? '0 0 20px rgba(245,158,11,0.15)' : 'none',
              fontFamily: 'var(--font-mono, monospace)',
              boxSizing: 'border-box',
            }}
            placeholder="000000"
            required
          />
          {/* Demo hint */}
          <p style={{
            marginTop: 6, fontSize: 10, color: 'var(--color-text-muted)',
            fontFamily: 'JetBrains Mono, monospace', textAlign: 'center',
          }}>
            Demo mode: use code <span style={{ color: '#f59e0b' }}>123456</span>
          </p>
        </div>

        {error && (
          <div style={{
            color: '#ef4444', fontSize: '13px', background: 'rgba(239,68,68,0.1)',
            padding: '12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, padding: '14px', background: 'rgba(0,0,0,0.05)', color: '#0f172a',
              border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px', fontWeight: '600',
              cursor: 'pointer', transition: 'all 0.2s', fontSize: 14,
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
          >
            Abort
          </button>
          <button
            type="submit"
            disabled={loading || totp.length < 6}
            style={{
              flex: 2, padding: '14px', background: '#f59e0b', color: '#000',
              border: 'none', borderRadius: '8px', fontWeight: '700',
              cursor: (loading || totp.length < 6) ? 'not-allowed' : 'pointer',
              opacity: (loading || totp.length < 6) ? 0.6 : 1,
              transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(245,158,11,0.3)',
              fontSize: 14,
            }}
          >
            {loading ? 'VERIFYING...' : 'AUTHORIZE'}
          </button>
        </div>
      </form>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes pulse-amber { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,0.4); } 70% { box-shadow: 0 0 0 15px rgba(245,158,11,0); } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } }
      `}} />
    </div>
  );
}
