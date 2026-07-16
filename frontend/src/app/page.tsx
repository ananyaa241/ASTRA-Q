'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Root route redirect controller.
 * - If sessionStorage has a valid 'aegis_session' → redirect to /dashboard
 * - Else → redirect to /access
 * Wrapped in useEffect for SSR safety (sessionStorage is client-only).
 */
export default function RootRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    let destination = '/access';
    try {
      if (typeof window !== 'undefined') {
        const raw = sessionStorage.getItem('aegis_session');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.isAuthenticated) {
            destination = '/dashboard';
          }
        }
      }
    } catch {
      // sessionStorage unavailable — fall through to /access
    }
    router.replace(destination);
  }, [router]);

  // Show a centered spinner while determining redirect destination
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#04070d', flexDirection: 'column', gap: 14,
    }}>
      <div style={{
        width: 44, height: 44,
        border: '2px solid rgba(34,211,238,0.15)',
        borderTopColor: '#22d3ee',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{
        color: 'rgba(34,211,238,0.6)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11, letterSpacing: '0.08em',
      }}>
        INITIALIZING GATEWAY...
      </p>
    </div>
  );
}
