"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/week", label: "Week" },
  { href: "/analytics", label: "Analytics" },
  { href: "/setup", label: "Setup" },
];

export default function Nav() {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  if (isLanding) return null;

  return (
    <nav className="sticky top-0 z-50 h-14 bg-white/80 backdrop-blur-md border-b border-zinc-100 flex items-center">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 w-full flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 shrink-0 group">
          <span className="w-2 h-2 rounded-full bg-indigo-600 group-hover:scale-110 transition-transform" />
          <span className="text-[15px] font-semibold text-zinc-900 tracking-tight">Sunday</span>
        </Link>

        {/* Center links */}
        <div className="hidden sm:flex items-center gap-1">
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
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-indigo-600 rounded-t-full" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right */}
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
