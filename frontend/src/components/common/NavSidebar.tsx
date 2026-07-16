'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface Props {
  activePath: string;
  criticalCount: number;
}

export default function NavSidebar({ activePath, criticalCount }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const { session } = useAuth();

  const isActive = (path: string) => pathname?.startsWith(path) || activePath === path;

  const handleAuditScroll = () => {
    const el = document.getElementById('audit-trail');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const avatarChar = session?.userId ? session.userId[0].toUpperCase() : '?';

  return (
    <nav className="nav-sidebar" aria-label="Navigation sidebar">
      {/* ASTRA-Q Logo icon at top */}
      <div style={{ marginBottom: 8 }}>
        <img
          src="/logo.png" alt="ASTRA-Q"
          style={{ width: 28, height: 28, borderRadius: 6, opacity: 0.9 }}
        />
      </div>

      {/* Dashboard / Shield icon */}
      <button
        className={`nav-icon-btn ${isActive('/dashboard') ? 'active' : ''}`}
        onClick={() => router.push('/dashboard')}
        title="Dashboard"
        aria-label="Go to Dashboard"
        style={{ position: 'relative' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        {criticalCount > 0 && (
          <span className="nav-badge">{criticalCount > 9 ? '9+' : criticalCount}</span>
        )}
      </button>

      {/* Access / Lock icon */}
      <button
        className={`nav-icon-btn ${isActive('/access') ? 'active' : ''}`}
        onClick={() => router.push('/access')}
        title="Access Gateway"
        aria-label="Go to Access Gateway"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </button>

      {/* Audit trail / Document icon */}
      <button
        className="nav-icon-btn"
        onClick={handleAuditScroll}
        title="PQC Audit Trail"
        aria-label="Scroll to Audit Trail"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      </button>

      {/* Spacer pushes avatar to bottom */}
      <div style={{ flex: 1 }} />

      {/* User avatar */}
      <div
        title={session?.userId ?? 'Not authenticated'}
        style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(34,211,238,0.15)',
          border: '1px solid rgba(34,211,238,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13, fontWeight: 700,
          color: 'var(--color-cyan)',
          cursor: 'default',
        }}
      >
        {avatarChar}
      </div>
    </nav>
  );
}
