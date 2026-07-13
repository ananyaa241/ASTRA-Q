import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aegis-Q | Quantum-Hardened Insider Threat Detection',
  description:
    'Real-time AI-powered SOC dashboard with post-quantum cryptographic audit trail. Dual-engine HeteroGCN + Transformer threat detection on CERT r4.2.',
  keywords: ['SOC', 'insider threat', 'cybersecurity', 'post-quantum', 'ML-KEM', 'ML-DSA', 'AI security'],
  authors: [{ name: 'Aegis-Q Team' }],
  openGraph: {
    title: 'Aegis-Q SOC Dashboard',
    description: 'Quantum-Hardened Insider Threat Detection Platform',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Inline styles on html + body are the ONLY reliable way to lock scrolling
     * in Next.js 14 App Router — there is no #__next wrapper in App Router.
     */
    <html
      lang="en"
      suppressHydrationWarning
      style={{ height: '100%', overflow: 'hidden', margin: 0, padding: 0 }}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#070b14" />
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡️</text></svg>"
        />
      </head>
      <body
        suppressHydrationWarning
        style={{
          height: '100%',
          overflow: 'hidden',
          margin: 0,
          padding: 0,
          background: '#070b14',
        }}
      >
        {children}
      </body>
    </html>
  );
}
