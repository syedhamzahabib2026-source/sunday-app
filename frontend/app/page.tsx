import Link from "next/link";
import ScheduleRedirect from "@/components/ScheduleRedirect";

export const metadata = {
  title: "Sunday — Life scheduling, reimagined",
  description: "Sunday builds your week around your real life. Sleep, meals, workouts, commute — all protected.",
};

const features = [
  {
    icon: "🛡",
    title: "Realistic by design",
    body: "Schedules built around sleep, meals, and recovery first. Tasks fill what remains — never the other way around.",
    accentColor: "#4f46e5",
    iconBg: "bg-indigo-50",
  },
  {
    icon: "⚡",
    title: "Adapts automatically",
    body: "Life changed? Tell Sunday. It reorganizes your entire week around your priorities without dropping the ball.",
    accentColor: "#16a34a",
    iconBg: "bg-green-50",
  },
  {
    icon: "🧠",
    title: "Zero decision fatigue",
    body: "Follow your schedule blindly. Sunday does the thinking — you just execute.",
    accentColor: "#ea580c",
    iconBg: "bg-orange-50",
  },
];

const steps = [
  { n: "01", title: "Fill your Sunday setup", body: "Two minutes. Sleep time, workouts, meals, commute. Set it once." },
  { n: "02", title: "Sunday generates your full week", body: "Every task placed in the first available slot that respects all your constraints." },
  { n: "03", title: "Life changes? Update via Slack", body: "\"I picked up a shift Thursday\" — and Sunday handles the rest." },
  { n: "04", title: "Sunday rebuilds around what's left", body: "Priority cascade: critical tasks always land, optional ones flex." },
];

const testimonials = [
  {
    quote: "I used to spend Sunday nights dreading my week. Now I just look at what Sunday built and get to work.",
    name: "Alex K.", role: "Founder", initials: "AK", borderColor: "#4f46e5",
  },
  {
    quote: "Med school + studying + gym. Sunday is the only tool that actually handles all three without something slipping.",
    name: "Maya R.", role: "Med Student", initials: "MR", borderColor: "#16a34a",
  },
  {
    quote: "The Slack bot is the feature. I add tasks on my commute and they're already placed by the time I sit down.",
    name: "Jordan T.", role: "Engineer", initials: "JT", borderColor: "#ea580c",
  },
];

const AVATARS = [
  { initials: "AK", bg: "bg-indigo-100", text: "text-indigo-700" },
  { initials: "MR", bg: "bg-green-100",  text: "text-green-700"  },
  { initials: "JT", bg: "bg-amber-100",  text: "text-amber-700"  },
  { initials: "LS", bg: "bg-purple-100", text: "text-purple-700" },
  { initials: "PW", bg: "bg-pink-100",   text: "text-pink-700"   },
];

export default function LandingPage() {
  return (
    <div className="bg-white">
      <ScheduleRedirect />
      {/* ── Standalone nav ── */}
      <header className="sticky top-0 z-50 h-14 bg-white/90 backdrop-blur-md border-b border-zinc-100 flex items-center">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 w-full flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
            <span className="text-[15px] font-semibold text-zinc-900">Sunday</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/today" className="hidden sm:block text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
              Dashboard
            </Link>
            <Link href="/setup" className="bg-indigo-600 text-white text-[13px] font-semibold px-4 py-1.5 rounded-full hover:bg-indigo-700 transition-colors shadow-sm">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="relative"
        style={{
          backgroundImage: "radial-gradient(circle, #e4e4e7 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {/* Indigo glow */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] rounded-full bg-indigo-400/10 blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-indigo-100 text-indigo-600 text-[11px] font-bold px-3 py-1.5 rounded-full mb-8 uppercase tracking-widest shadow-sm fade-up">
            Life scheduling, reimagined
          </div>

          <h1
            className="text-[44px] sm:text-[64px] font-semibold leading-[1.05] tracking-tight text-zinc-900 mb-6 fade-up"
            style={{ animationDelay: "60ms" }}
          >
            Your week,{" "}
            <span className="text-indigo-600">finally under control</span>.
          </h1>

          <p
            className="text-[17px] sm:text-[19px] text-zinc-500 leading-relaxed max-w-[540px] mx-auto mb-10 fade-up"
            style={{ animationDelay: "120ms" }}
          >
            Sunday builds your week around your real life — sleep, meals, workouts, commute, and everything else. Then adapts when life changes.
          </p>

          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6 fade-up"
            style={{ animationDelay: "180ms" }}
          >
            <Link
              href="/setup"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-[15px] font-semibold px-7 py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-indigo-200 hover:shadow-lg"
            >
              Get started free
              <svg
                className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center text-zinc-600 text-[15px] font-medium px-7 py-3.5 rounded-xl hover:text-zinc-900 hover:bg-white transition-all border border-zinc-200 hover:border-zinc-300 hover:shadow-sm"
            >
              See how it works
            </a>
          </div>

          {/* Avatar row */}
          <div className="flex items-center justify-center gap-3 fade-up" style={{ animationDelay: "240ms" }}>
            <div className="flex items-center">
              {AVATARS.map(({ initials, bg, text }, i) => (
                <div
                  key={initials}
                  className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold ${bg} ${text} ${i > 0 ? "-ml-2" : ""}`}
                >
                  {initials}
                </div>
              ))}
            </div>
            <span className="text-[13px] text-zinc-500">Join 200+ people building with Sunday</span>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {features.map(({ icon, title, body, accentColor, iconBg }) => (
              <div
                key={title}
                className="group bg-white border border-zinc-200 border-t-2 rounded-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default"
                style={{ borderTopColor: accentColor }}
              >
                <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center text-xl mb-4`}>
                  {icon}
                </div>
                <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">{title}</h3>
                <p className="text-[14px] text-zinc-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="border-t border-zinc-100 bg-zinc-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-[28px] sm:text-[32px] font-semibold text-zinc-900 mb-12 leading-tight">
            From nothing to a full week<br className="hidden sm:block" /> in five minutes.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-10">
            {steps.map(({ n, title, body }) => (
              <div key={n} className="relative overflow-hidden pl-2">
                {/* Faded background number */}
                <span className="absolute -top-4 -left-1 text-[90px] font-extrabold text-zinc-100 leading-none select-none pointer-events-none">
                  {n}
                </span>
                <div className="relative">
                  <h3 className="text-[15px] font-semibold text-zinc-900 mb-1.5">{title}</h3>
                  <p className="text-[14px] text-zinc-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="border-t border-zinc-100 bg-zinc-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 text-center">What people say</p>
          <h2 className="text-[26px] font-semibold text-zinc-900 mb-10 text-center">
            Built for people who take their time seriously.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {testimonials.map(({ quote, name, role, initials, borderColor }) => (
              <div
                key={name}
                className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
                style={{ borderLeft: `4px solid ${borderColor}` }}
              >
                <p className="text-[14px] text-zinc-600 leading-relaxed mb-5 italic">&ldquo;{quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ backgroundColor: `${borderColor}18`, color: borderColor }}
                  >
                    {initials}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-900">{name}</p>
                    <p className="text-[12px] text-zinc-400">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dark CTA ── */}
      <section className="border-t border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="bg-zinc-900 rounded-2xl px-8 sm:px-16 py-14 sm:py-16 text-center">
            <h2 className="text-[30px] sm:text-[36px] font-semibold text-white mb-4 leading-tight">
              Ready to take back your week?
            </h2>
            <p className="text-[16px] text-zinc-400 mb-8 max-w-[380px] mx-auto leading-relaxed">
              Five minutes of setup. A week of clarity. No credit card required.
            </p>
            <Link
              href="/setup"
              className="group inline-flex items-center gap-2 bg-indigo-600 text-white text-[15px] font-semibold px-8 py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-500/30"
            >
              Start your first Sunday
              <svg
                className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-200 px-4 sm:px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
            <span className="text-[14px] font-semibold text-zinc-900">Sunday</span>
          </div>
          <div className="flex items-center gap-5">
            {["/today", "/week", "/analytics", "/setup"].map((href) => (
              <Link key={href} href={href} className="text-[13px] text-zinc-400 hover:text-zinc-900 transition-colors capitalize">
                {href.slice(1)}
              </Link>
            ))}
          </div>
          <span className="text-[12px] text-zinc-400">© 2025 Sunday. Built for people with real lives.</span>
        </div>
      </footer>
    </div>
  );
}
