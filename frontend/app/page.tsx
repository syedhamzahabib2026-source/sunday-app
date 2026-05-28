import Link from "next/link";

export const metadata = {
  title: "Sunday — Life scheduling, reimagined",
  description: "Sunday builds your week around your real life. Sleep, meals, workouts, commute — all protected.",
};

const features = [
  {
    icon: "🛡",
    title: "Realistic by design",
    body: "Schedules built around sleep, meals, and recovery first. Tasks fill what remains — never the other way around.",
  },
  {
    icon: "⚡",
    title: "Adapts automatically",
    body: "Life changed? Tell Sunday. It reorganizes your entire week around your priorities without dropping the ball.",
  },
  {
    icon: "🧠",
    title: "Zero decision fatigue",
    body: "Follow your schedule blindly. Sunday does the thinking — you just execute.",
  },
];

const steps = [
  { n: "01", title: "Fill your Sunday setup", body: "Two minutes. Sleep time, workouts, meals, commute. Set it once." },
  { n: "02", title: "Sunday generates your full week", body: "Every task placed in the first available slot that respects all your constraints." },
  { n: "03", title: "Life changes? Update via Slack", body: "\"I picked up a shift Thursday\" and Sunday handles the rest." },
  { n: "04", title: "Sunday rebuilds around what's left", body: "Priority cascade: critical tasks always land, optional ones flex." },
];

const testimonials = [
  {
    quote: "I used to spend Sunday nights dreading my week. Now I just look at what Sunday built and get to work.",
    name: "Alex K.",
    role: "Founder",
    initials: "AK",
  },
  {
    quote: "Med school + studying + gym. Sunday is the only tool that actually handles all three without something slipping.",
    name: "Maya R.",
    role: "Med Student",
    initials: "MR",
  },
  {
    quote: "The Slack bot is the feature. I add tasks on my commute and they're already placed by the time I sit down.",
    name: "Jordan T.",
    role: "Engineer",
    initials: "JT",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-white">
      {/* Standalone nav for landing page */}
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
            <Link href="/setup" className="bg-indigo-600 text-white text-[13px] font-semibold px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-32 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-600 text-[11px] font-bold px-3 py-1.5 rounded-full mb-8 uppercase tracking-widest fade-up">
          Life scheduling, reimagined
        </div>

        <h1 className="text-[44px] sm:text-[64px] font-semibold leading-[1.05] tracking-tight text-zinc-900 mb-6 fade-up" style={{ animationDelay: "60ms" }}>
          Your week, finally<br />under control.
        </h1>

        <p className="text-[17px] sm:text-[19px] text-zinc-500 leading-relaxed max-w-[540px] mx-auto mb-10 fade-up" style={{ animationDelay: "120ms" }}>
          Sunday builds your week around your real life — sleep, meals, workouts, commute, and everything else. Then adapts when life changes.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-7 fade-up" style={{ animationDelay: "180ms" }}>
          <Link
            href="/setup"
            className="w-full sm:w-auto inline-flex items-center justify-center bg-indigo-600 text-white text-[15px] font-semibold px-7 py-3.5 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Get started free →
          </Link>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto inline-flex items-center justify-center text-zinc-500 text-[15px] font-medium px-7 py-3.5 rounded-xl hover:text-zinc-900 hover:bg-zinc-50 transition-colors border border-zinc-200"
          >
            See how it works
          </a>
        </div>

        <p className="text-[13px] text-zinc-400 fade-up" style={{ animationDelay: "240ms" }}>
          Built for founders, students, and people who actually have a life
        </p>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {features.map(({ icon, title, body }) => (
              <div key={title} className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-2xl mb-4">{icon}</div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {steps.map(({ n, title, body }) => (
              <div key={n} className="flex gap-5">
                <span className="text-[13px] font-mono font-bold text-zinc-300 tabular-nums shrink-0 mt-0.5 w-7">{n}</span>
                <div>
                  <h3 className="text-[15px] font-semibold text-zinc-900 mb-1.5">{title}</h3>
                  <p className="text-[14px] text-zinc-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="border-t border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 text-center">What people say</p>
          <h2 className="text-[26px] font-semibold text-zinc-900 mb-10 text-center">Built for people who take their time seriously.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {testimonials.map(({ quote, name, role, initials }) => (
              <div key={name} className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
                <p className="text-[14px] text-zinc-600 leading-relaxed mb-5 italic">&ldquo;{quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-600 shrink-0">
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
              className="inline-flex items-center gap-2 bg-indigo-600 text-white text-[15px] font-semibold px-8 py-3.5 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Start your first Sunday →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-100 px-4 sm:px-6 py-6">
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
          <span className="text-[12px] text-zinc-400">Built with Sunday</span>
        </div>
      </footer>
    </div>
  );
}
