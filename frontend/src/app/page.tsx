'use client';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function LandingPage() {
  const router = useRouter();

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      color: '#0f172a',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Background Gradients (Mint Green & Dark) */}
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%', width: '50%', height: '50%',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(10, 10, 10, 0) 70%)',
        filter: 'blur(100px)', zIndex: 0
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%', width: '60%', height: '60%',
        background: 'radial-gradient(circle, rgba(52, 211, 153, 0.12) 0%, rgba(10, 10, 10, 0) 70%)',
        filter: 'blur(120px)', zIndex: 0
      }} />

      {/* Navigation */}
      <nav style={{
        position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', padding: '24px 60px', maxWidth: 1400, margin: '0 auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/astra_logo.jpg" alt="Astra-Q" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '1px', marginRight: '2rem' }}>Astra-Q</span>
        </div>
        <div style={{ display: 'flex', gap: 32, fontSize: 14, fontWeight: 500, color: 'rgba(0,0,0,0.6)' }}>
          <span style={{ cursor: 'pointer' }}>Products</span>
          <span style={{ cursor: 'pointer' }}>Solutions</span>
          <span style={{ cursor: 'pointer' }}>Resources</span>
          <span style={{ cursor: 'pointer' }}>Pricing</span>
        </div>
        <button
          onClick={() => router.push('/access')}
          style={{
            marginLeft: '32px',
            padding: '10px 24px', background: 'transparent', border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 8, color: '#0f172a', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
          }}
        >
          Access Gateway
        </button>
      </nav>

      {/* Hero Section */}
      <motion.main
        initial={{ opacity: 0, boxShadow: 'inset 0 0 0 0px rgba(16, 185, 129, 0)' }}
        animate={{ opacity: 1, boxShadow: 'inset 0 0 0 2px rgba(16, 185, 129, 0.2)' }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
        style={{
          position: 'relative', zIndex: 10, maxWidth: 900, margin: '60px auto 0',
          textAlign: 'center', padding: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center',
          flex: 1, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 24, backdropFilter: 'blur(10px)'
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)',
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#059669',
            marginBottom: 24, display: 'inline-block'
          }}
        >
          <span style={{ display: 'inline-block', width: 6, height: 6, background: '#10b981', borderRadius: '50%', marginRight: 8 }} />
          Post-Quantum Ready Infrastructure
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-1px', marginBottom: 24 }}
        >
          Enterprise-Grade Insider<br />
          <span style={{ background: 'linear-gradient(to right, #0f172a, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Threat Protection
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          style={{ fontSize: 18, color: 'rgba(0,0,0,0.6)', maxWidth: 650, margin: '0 auto 40px', lineHeight: 1.6 }}
        >
          Secure privileged identities through continuous behavioral monitoring and risk-based security decisions.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          style={{ display: 'flex', gap: 16, justifyContent: 'center' }}
        >
          <button
            onClick={() => router.push('/access')}
            style={{
              padding: '16px 32px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none',
              borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 16, cursor: 'pointer',
              boxShadow: '0 8px 30px rgba(16, 185, 129, 0.3)'
            }}
          >
            Enter Dashboard
          </button>
          <button
            style={{
              padding: '16px 32px', background: 'rgba(255,255,255,1)', border: '1px solid rgba(0,0,0,0.15)',
              borderRadius: 8, color: '#0f172a', fontWeight: 600, fontSize: 16, cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
            }}
          >
            View Documentation
          </button>
        </motion.div>
      </motion.main>

      {/* Tech Stack Footer */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.6 }}
        style={{
          width: '100%', textAlign: 'center', zIndex: 10, padding: '40px 0', marginTop: 'auto'
        }}
      >
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 20 }}>
          Powered by industry-leading technologies
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, opacity: 0.5, color: '#0f172a' }}>
          {/* Tech stack names (simple text representations for logos) */}
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>FastAPI</span>
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)' }}>Next.js</span>
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-sans)' }}>Post-Quantum</span>
          <span style={{ fontSize: 20, fontWeight: 700, fontStyle: 'italic' }}>PyTorch</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Kafka</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Groq AI</span>
        </div>
      </motion.div>
    </div>
  );
}
