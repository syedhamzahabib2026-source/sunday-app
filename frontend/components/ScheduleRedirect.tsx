"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function ScheduleRedirect() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // ?landing=1 is the escape hatch — always show landing page, never redirect
    if (new URLSearchParams(window.location.search).get("landing") === "1") return;
    if (isLoading) return;
    router.replace(user ? "/today" : "/login");
  }, [user, isLoading, router]);

  return null;
}
