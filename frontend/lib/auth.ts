const TOKEN_KEY = "sunday_token";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  timezone: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "https://sunday-app-production-d774.up.railway.app"}/api/v1`;

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}
