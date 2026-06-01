"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { handleToken } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = searchParams.get("token");
    if (!token) {
      router.replace("/login?error=no_token");
      return;
    }
    handleToken(token)
      .then(() => router.replace("/today"))
      .catch(() => router.replace("/login?error=invalid_token"));
  }, [searchParams, router, handleToken]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-[14px] text-zinc-500">Signing you in…</p>
    </div>
  );
}
