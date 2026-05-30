"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "https://sunday-app-production-d774.up.railway.app"}/api/v1`;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ScheduleRedirect() {
  const router = useRouter();

  useEffect(() => {
    // ?landing=1 is the escape hatch — always show landing page, never redirect
    if (new URLSearchParams(window.location.search).get("landing") === "1") return;

    fetch(`${BASE}/schedule/1/day/${todayStr()}`)
      .then(r => (r.ok ? r.json() : []))
      .then((blocks: unknown) => {
        if (Array.isArray(blocks) && blocks.length > 0) {
          router.replace("/today");
        }
      })
      .catch(() => {});
  }, [router]);

  return null;
}
