'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthSession {
  userId: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  fusedScore: number;
  isAuthenticated: boolean;
  analystId: string; // derived: `analyst_${userId.toLowerCase()}`
}

export interface AuthContextValue {
  session: AuthSession | null;
  setSession: (s: AuthSession | null) => void;
  clearSession: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'aegis_session';

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(null);

  // Hydrate from sessionStorage on mount (SSR-safe)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthSession;
        setSessionState(parsed);
      }
    } catch {
      // sessionStorage unavailable (private browsing / SSR) — session lives in React state only
    }
  }, []);

  const setSession = useCallback((s: AuthSession | null) => {
    setSessionState(s);
    if (typeof window === 'undefined') return;
    try {
      if (s) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
  }, [setSession]);

  return (
    <AuthContext.Provider value={{ session, setSession, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthContextProvider');
  }
  return ctx;
}
