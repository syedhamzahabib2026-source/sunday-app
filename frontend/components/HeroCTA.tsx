"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getTodaySchedule } from "@/lib/api";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function HeroCTA() {
  const { user, isLoading } = useAuth();
  const [hasSchedule, setHasSchedule] = useState(false);

  useEffect(() => {
    if (!user) { setHasSchedule(false); return; }
    getTodaySchedule(todayStr())
      .then(blocks => setHasSchedule(blocks.length > 0))
      .catch(() => setHasSchedule(false));
  }, [user]);

  if (isLoading) return null;

  const href = user && hasSchedule ? "/today" : "/setup";
  const label = user && hasSchedule ? "Go to my schedule" : "Get started free";

  return (
    <Link
      href={href}
      className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-[15px] font-semibold px-7 py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-indigo-200 hover:shadow-lg"
    >
      {label}
      <svg
        className="w-4 h-4 group-hover:translate-x-1 transition-transform"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
