'use client';
import { motion } from 'framer-motion';

interface Props {
  onBack: () => void;
}

/**
 * CriticalDenial — full-card component shown when the backend returns 403 (CRITICAL risk tier).
 * Signals automated containment has been initiated and logged to the PQC audit trail.
 */
export default function CriticalDenial({ onBack }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{
        padding: '40px',
        width: '100%',
        maxWidth: '440px',
        margin: '0 auto',
        background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(239,68,68,0.45)',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.05), inset 0 0 80px rgba(239,68,68,0.03), 0 0 40px rgba(239,68,68,0.15)',
        animation: 'pulse-critical 2.5s ease-in-out infinite',
        textAlign: 'center',
      }}>

      {/* Shield-X icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '72px', height: '72px', borderRadius: '50%',
          background: 'rgba(239,68,68,0.15)',
          border: '2px solid rgba(239,68,68,0.5)',
          marginBottom: '24px',
          boxShadow: '0 0 32px rgba(239,68,68,0.3)',
        }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </svg>
      </motion.div>

      {/* Heading */}
      <h2 style={{
        color: '#ef4444',
        fontSize: '26px',
        fontWeight: '800',
        letterSpacing: '0.1em',
        fontFamily: 'JetBrains Mono, monospace',
        marginBottom: '12px',
        textShadow: '0 0 20px rgba(239,68,68,0.5)',
      }}>
        ACCESS DENIED
      </h2>

      {/* Subtext */}
      <p style={{
        color: 'rgba(0,0,0,0.65)',
        fontSize: '13px',
        lineHeight: '1.7',
        marginBottom: '24px',
        maxWidth: '340px',
        margin: '0 auto 24px',
      }}>
        <strong style={{ color: 'rgba(239,68,68,0.9)' }}>CRITICAL risk tier detected.</strong>{' '}
        Automated containment has been initiated and logged to the PQC audit trail.
      </p>

      {/* PQC badge */}
      <div style={{ marginBottom: '28px' }}>
        <span style={{
          fontSize: '9px',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          color: '#a5b4fc',
          padding: '4px 10px',
          background: 'rgba(165,180,252,0.15)',
          border: '1px solid rgba(165,180,252,0.4)',
          borderRadius: '6px',
          letterSpacing: '0.08em',
          boxShadow: '0 0 16px rgba(165,180,252,0.15)',
        }}>
          ML-DSA-87 · AUDIT LOGGED
        </span>
      </div>

      {/* Return button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onBack}
        style={{
          padding: '12px 28px',
          background: 'rgba(239,68,68,0.12)',
          color: '#ef4444',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: '700',
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.05em',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 4px 16px rgba(239,68,68,0.15)',
        }}
        onMouseOver={e => {
          e.currentTarget.style.background = 'rgba(239,68,68,0.2)';
          e.currentTarget.style.boxShadow = '0 4px 24px rgba(239,68,68,0.3)';
        }}
        onMouseOut={e => {
          e.currentTarget.style.background = 'rgba(239,68,68,0.12)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(239,68,68,0.15)';
        }}
      >
        ← Return to Gateway
      </motion.button>
    </motion.div>
  );
}
