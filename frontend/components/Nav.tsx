"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/week", label: "Week" },
  { href: "/setup", label: "Setup" },
  { href: "/analytics", label: "Analytics" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-[15px] font-semibold text-zinc-900 tracking-tight select-none hover:opacity-70 transition-opacity shrink-0"
        >
          Sunday
        </Link>

        <div className="flex items-center gap-1">
          {LINKS.map(({ href, label }) => {
            const active =
              href === "/today"
                ? pathname === "/today"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`hidden sm:block px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active
                    ? "text-zinc-900 bg-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <Link
            href="/setup"
            className="ml-2 px-4 py-1.5 bg-indigo-600 text-white text-[13px] font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
