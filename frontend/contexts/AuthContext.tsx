"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AuthUser, clearToken, fetchMe, getToken, setToken } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  signOut: () => void;
  /** Called by /auth/callback after Google redirects back with ?token= */
  handleToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getToken();
    if (!stored) { setLoading(false); return; }
    fetchMe(stored)
      .then(u => { setUser(u); setTokenState(stored); })
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function handleToken(newToken: string) {
    setToken(newToken);
    const u = await fetchMe(newToken);
    setTokenState(newToken);
    setUser(u);
  }

  function signOut() {
    clearToken();
    setTokenState(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signOut, handleToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
