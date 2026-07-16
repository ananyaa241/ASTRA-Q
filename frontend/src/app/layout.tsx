import type { Metadata } from 'next';
import './globals.css';
import { AuthContextProvider } from '@/context/AuthContext';

export const metadata: Metadata = {
  title: 'ASTRA-Q | Advanced Security Threat Response Architecture – Quantum',
  description:
    'AI-Powered Quantum-Resilient Platform for Insider Threat Detection and Privileged Access Security.',
  keywords: ['SOC', 'insider threat', 'cybersecurity', 'post-quantum', 'ML-KEM', 'ML-DSA', 'AI security'],
  authors: [{ name: 'ASTRA-Q Team' }],
  openGraph: {
    title: 'ASTRA-Q SOC Dashboard',
    description: 'AI-Powered Quantum-Resilient Platform for Insider Threat Detection and Privileged Access Security.',
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
          href="/logo.png"
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
        <AuthContextProvider>
          {children}
        </AuthContextProvider>
      </body>
    </html>
  );
}

