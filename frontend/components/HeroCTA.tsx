"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "https://sunday-app-production-d774.up.railway.app"}/api/v1`;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function HeroCTA() {
  const [hasSchedule, setHasSchedule] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/schedule/1/day/${todayStr()}`)
      .then(r => (r.ok ? r.json() : []))
      .then((blocks: unknown) => {
        setHasSchedule(Array.isArray(blocks) && blocks.length > 0);
      })
      .catch(() => {});
  }, []);

  return (
    <Link
      href="/setup"
      className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-[15px] font-semibold px-7 py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-indigo-200 hover:shadow-lg"
    >
      {hasSchedule ? "Regenerate this week" : "Get started free"}
      <svg
        className="w-4 h-4 group-hover:translate-x-1 transition-transform"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
