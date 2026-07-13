import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aegis-Q | Quantum-Hardened Insider Threat Detection',
  description:
    'Real-time AI-powered Security Operations Center dashboard with post-quantum cryptographic audit trail. Dual-engine HeteroGCN + Transformer threat detection.',
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#070b14" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡️</text></svg>" />
      </head>
      {/* suppressHydrationWarning: prevents mismatch warnings from browser extensions */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
