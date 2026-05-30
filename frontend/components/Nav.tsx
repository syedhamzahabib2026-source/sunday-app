"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/week", label: "Week" },
  { href: "/analytics", label: "Analytics" },
  { href: "/setup", label: "Setup" },
];

export default function Nav() {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isLanding) return null;

  return (
    <nav
      className={`sticky top-0 z-50 h-14 bg-white/90 backdrop-blur-md transition-all duration-200 ${
        scrolled ? "shadow-[0_1px_12px_rgba(0,0,0,0.08)]" : "border-b border-zinc-100"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 w-full h-full flex items-center justify-between gap-4">
        {/* Logo — links to landing page (escape hatch from auto-redirect) */}
        <Link href="/?landing=1" className="flex items-center gap-1.5 shrink-0 group">
          <span className="w-2 h-2 rounded-full bg-indigo-600 group-hover:scale-125 transition-transform duration-150" />
          <span className="text-[15px] font-semibold text-zinc-900 tracking-tight">Sunday</span>
        </Link>

        {/* Center links */}
        <div className="hidden sm:flex items-center gap-0.5">
          {LINKS.map(({ href, label }) => {
            const active = href === "/today" ? pathname === "/today" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? "text-indigo-600" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                {label}
                {active && (
                  <span className="absolute bottom-[1px] left-2 right-2 h-[2px] bg-indigo-600 rounded-t-full" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors flex items-center justify-center text-[11px] font-bold text-zinc-500"
            title="Settings"
          >
            S
          </Link>
        </div>
      </div>
    </nav>
  );
}
