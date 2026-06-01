"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const LINKS = [
  { href: "/today",     label: "Today"     },
  { href: "/week",      label: "Week"      },
  { href: "/analytics", label: "Analytics" },
  { href: "/setup",     label: "Setup"     },
];

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, signOut, isLoading } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isLanding = pathname === "/";
  const isAuth    = pathname?.startsWith("/login") || pathname?.startsWith("/auth/");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isLanding || isAuth) return null;

  function handleSignOut() {
    setMenuOpen(false);
    signOut();
    router.push("/login");
  }

  return (
    <nav
      className={`sticky top-0 z-50 h-14 bg-white/90 backdrop-blur-md transition-all duration-200 ${
        scrolled ? "shadow-[0_1px_12px_rgba(0,0,0,0.08)]" : "border-b border-zinc-100"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 w-full h-full flex items-center justify-between gap-4">
        <Link href="/?landing=1" className="flex items-center gap-1.5 shrink-0 group">
          <span className="w-2 h-2 rounded-full bg-indigo-600 group-hover:scale-125 transition-transform duration-150" />
          <span className="text-[15px] font-semibold text-zinc-900 tracking-tight">Sunday</span>
        </Link>

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

        <div className="relative flex items-center gap-2">
          {!isLoading && (
            <>
              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(o => !o)}
                    className="flex items-center gap-2 rounded-full hover:bg-zinc-100 transition-colors p-1 pr-2"
                    title={user.name}
                  >
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.name}
                        className="w-7 h-7 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-700">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="hidden sm:block text-[13px] font-medium text-zinc-700 max-w-[100px] truncate">
                      {user.name.split(" ")[0]}
                    </span>
                  </button>

                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-10 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 w-44 overflow-hidden">
                        <div className="px-3 py-2 border-b border-zinc-100">
                          <p className="text-[13px] font-semibold text-zinc-900 truncate">{user.name}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{user.email}</p>
                        </div>
                        <Link
                          href="/settings"
                          onClick={() => setMenuOpen(false)}
                          className="block px-3 py-2 text-[13px] text-zinc-700 hover:bg-zinc-50 transition-colors"
                        >
                          Settings
                        </Link>
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Link
                  href="/login"
                  className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  Sign in
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
