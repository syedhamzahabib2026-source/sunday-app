import Link from "next/link";

const features = [
  {
    icon: "🗓",
    title: "Constraint-first planning",
    body: "Sleep, gym, meals, and commute are locked in before anything else. Your tasks fill the gaps — never the other way around.",
  },
  {
    icon: "💬",
    title: "Natural language, via Slack",
    body: "Add tasks, log events, mark things done — in plain English from any device. No extra app to open, no context-switching.",
  },
  {
    icon: "⚡",
    title: "Intelligent reorganization",
    body: "When plans change, Sunday reshuffles by priority. Lower-priority tasks move to make room. It confirms before any disruptive change.",
  },
];

const steps = [
  {
    n: "01",
    title: "Set your constraints",
    body: "Tell Sunday your sleep times, morning routine, workout schedule, and commute. These blocks are sacred.",
  },
  {
    n: "02",
    title: "Add your tasks",
    body: "List what needs to happen this week with duration and priority. Sunday handles placement.",
  },
  {
    n: "03",
    title: "Get your full week",
    body: "A complete 7-day schedule in seconds. Everything has a place. Nothing overlaps.",
  },
  {
    n: "04",
    title: "Adapt as you go",
    body: "Tell your Slack bot what changed. Sunday reorganizes and asks before making disruptive moves.",
  },
];

const testimonials = [
  {
    quote: "I stopped losing track of my week the moment I switched to Sunday. It's like having a personal scheduler that actually knows my life.",
    name: "Alex K.",
    role: "Product Manager",
    initials: "AK",
  },
  {
    quote: "The Slack integration is the killer feature. I can add a task while commuting and it fits itself into my day automatically.",
    name: "Priya S.",
    role: "Founder",
    initials: "PS",
  },
  {
    quote: "I train Muay Thai 4 days a week and work a demanding job. Sunday is the only tool that's ever handled both without compromise.",
    name: "Jordan M.",
    role: "Software Engineer",
    initials: "JM",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-white">
      {/* ── Hero ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-600 text-[11px] font-bold px-3 py-1.5 rounded-full mb-8 uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
          AI-powered · Slack-driven · Always adapting
        </div>

        <h1 className="text-[42px] sm:text-[56px] font-semibold leading-[1.08] tracking-tight text-zinc-900 mb-6">
          Your week, finally<br />under control.
        </h1>

        <p className="text-[17px] sm:text-[19px] text-zinc-500 leading-relaxed max-w-[520px] mx-auto mb-10">
          Sunday is an AI scheduling assistant that builds your full 7-day plan around your life constraints, then adapts intelligently as things change.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/setup"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-[15px] font-semibold px-7 py-3.5 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Start your first Sunday →
          </Link>
          <Link
            href="/today"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-zinc-500 text-[15px] font-medium px-7 py-3.5 rounded-xl hover:text-zinc-900 hover:bg-zinc-50 transition-colors border border-zinc-200"
          >
            Open dashboard
          </Link>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10">
            {features.map(({ icon, title, body }) => (
              <div key={title} className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-[20px]">
                  {icon}
                </div>
                <h3 className="text-[15px] font-semibold text-zinc-900">{title}</h3>
                <p className="text-[14px] text-zinc-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2">How it works</p>
          <h2 className="text-[26px] sm:text-[30px] font-semibold text-zinc-900 mb-10 sm:mb-12">
            From zero to a full week<br className="hidden sm:block" /> in five minutes.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-14 gap-y-9">
            {steps.map(({ n, title, body }) => (
              <div key={n} className="flex gap-5">
                <span className="text-[12px] font-mono font-semibold text-zinc-300 tabular-nums shrink-0 mt-0.5 w-6">
                  {n}
                </span>
                <div className="space-y-1.5">
                  <h3 className="text-[15px] font-semibold text-zinc-900">{title}</h3>
                  <p className="text-[14px] text-zinc-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof ── */}
      <section className="border-t border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 text-center">
            What people say
          </p>
          <h2 className="text-[24px] font-semibold text-zinc-900 mb-10 text-center">
            Built for people who take their time seriously.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {testimonials.map(({ quote, name, role, initials }) => (
              <div key={name} className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
                <p className="text-[14px] text-zinc-600 leading-relaxed mb-5">&ldquo;{quote}&rdquo;</p>
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

      {/* ── CTA ── */}
      <section className="border-t border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="bg-zinc-900 rounded-2xl px-8 sm:px-14 py-12 sm:py-16 text-center">
            <h2 className="text-[28px] sm:text-[34px] font-semibold text-white mb-4 leading-tight">
              Start your first Sunday.
            </h2>
            <p className="text-[15px] sm:text-[16px] text-zinc-400 mb-8 max-w-[380px] mx-auto leading-relaxed">
              Five minutes of setup. A full week of clarity. No credit card required.
            </p>
            <Link
              href="/setup"
              className="inline-flex items-center gap-2 bg-white text-zinc-900 text-[15px] font-semibold px-8 py-3.5 rounded-xl hover:bg-zinc-100 transition-colors"
            >
              Set up Sunday →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-200 px-4 sm:px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[14px] font-semibold text-zinc-900">Sunday</span>
          <div className="flex items-center gap-5">
            {[
              { href: "/today", label: "Today" },
              { href: "/week", label: "Week" },
              { href: "/setup", label: "Setup" },
              { href: "/analytics", label: "Analytics" },
            ].map(({ href, label }) => (
              <Link key={href} href={href} className="text-[13px] text-zinc-400 hover:text-zinc-900 transition-colors">
                {label}
              </Link>
            ))}
          </div>
          <span className="text-[12px] text-zinc-400">© 2026 Sunday</span>
        </div>
      </footer>
    </div>
  );
}
