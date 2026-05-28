"use client";

import { useState } from "react";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Tokyo", "Asia/Singapore",
  "Australia/Sydney", "Pacific/Auckland",
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-zinc-200"}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const [name, setName] = useState("Test User");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [weekStart, setWeekStart] = useState<"monday" | "sunday">("monday");
  const [notifs, setNotifs] = useState({ slackReminders: true, weeklySummary: true, overloadWarnings: true });
  const [saved, setSaved] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-20">
      <div className="mb-8">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Settings</p>
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-zinc-900">Preferences</h1>
      </div>

      <div className="space-y-5">
        {/* Profile */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-[14px] font-semibold text-zinc-900 mb-4">Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-[14px] text-zinc-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">Timezone</label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-[14px] text-zinc-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all bg-white"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">Week starts on</label>
              <div className="flex gap-2">
                {(["monday", "sunday"] as const).map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setWeekStart(day)}
                    className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors capitalize ${
                      weekStart === day
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-[14px] font-semibold text-zinc-900 mb-4">Notifications</h2>
          <div className="space-y-0 divide-y divide-zinc-100">
            {[
              { key: "slackReminders" as const, label: "Slack reminders", desc: "Daily nudge for upcoming tasks" },
              { key: "weeklySummary" as const, label: "Weekly summary", desc: "Sunday evening recap of your week" },
              { key: "overloadWarnings" as const, label: "Overload warnings", desc: "Alert when schedule is over capacity" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-4">
                <div>
                  <p className="text-[14px] font-medium text-zinc-900">{label}</p>
                  <p className="text-[12px] text-zinc-400">{desc}</p>
                </div>
                <Toggle checked={notifs[key]} onChange={v => setNotifs(p => ({ ...p, [key]: v }))} />
              </div>
            ))}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          className="w-full bg-indigo-600 text-white text-[14px] font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-colors"
        >
          {saved ? "✓ Saved" : "Save changes"}
        </button>

        {/* Danger zone */}
        <div className="bg-white border border-red-100 rounded-xl p-6">
          <h2 className="text-[14px] font-semibold text-red-700 mb-2">Danger zone</h2>
          <p className="text-[13px] text-zinc-500 mb-4">This will permanently delete all your schedules, tasks, and preferences. This cannot be undone.</p>
          {!resetConfirm ? (
            <button
              onClick={() => setResetConfirm(true)}
              className="px-4 py-2 bg-white border border-red-200 text-red-600 text-[13px] font-semibold rounded-lg hover:bg-red-50 transition-colors"
            >
              Reset all data
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-red-600 font-medium">Are you sure? This is permanent.</span>
              <button disabled className="px-4 py-2 bg-red-600 text-white text-[13px] font-semibold rounded-lg opacity-50 cursor-not-allowed">
                Confirm reset
              </button>
              <button onClick={() => setResetConfirm(false)} className="text-[13px] text-zinc-500 hover:text-zinc-700">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
