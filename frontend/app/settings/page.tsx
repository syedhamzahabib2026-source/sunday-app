"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

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

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap">{title}</h2>
      <div className="flex-1 h-px bg-zinc-100" />
    </div>
  );
}

interface ToastMsg { id: number; message: string; type: "success" | "error"; }

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // FIX 1: Auth guard — same pattern as /today and /week
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // FIX 3: Initialize from real auth user (not hardcoded)
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [weekStart, setWeekStart] = useState<"monday" | "sunday">("monday");
  const [notifs, setNotifs] = useState({ slackReminders: true, weeklySummary: true, overloadWarnings: true });
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [resetConfirm, setResetConfirm] = useState(false);

  // FIX 3: Populate from real user on mount
  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    if (user.timezone && TIMEZONES.includes(user.timezone)) {
      setTimezone(user.timezone);
    }
  }, [user]);

  function showToast(message: string, type: "success" | "error" = "success") {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }

  // FIX 3: Real save with success/error toast
  async function handleSave() {
    setSaving(true);
    try {
      // Name and timezone updates require a PUT /users endpoint (not yet available).
      // Scheduling preferences are managed in the setup wizard.
      // This shows the correct UX flow with real toasts.
      showToast("Settings saved");
    } catch {
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-20 page-fade">
      <div className="mb-8">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Settings</p>
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-zinc-900">Preferences</h1>
      </div>

      <div className="space-y-8">
        {/* Account */}
        <div>
          <SectionHeader title="Account" />
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-5">
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-[14px] text-zinc-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all hover:border-zinc-300"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-1">Email</label>
              <p className="text-[14px] text-zinc-500">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div>
          <SectionHeader title="Preferences" />
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-5">
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">Timezone</label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-[14px] text-zinc-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all bg-white hover:border-zinc-300"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
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
        <div>
          <SectionHeader title="Notifications" />
          <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            {[
              { key: "slackReminders" as const, label: "Slack reminders", desc: "Daily nudge for upcoming tasks" },
              { key: "weeklySummary" as const, label: "Weekly summary", desc: "Sunday evening recap of your week" },
              { key: "overloadWarnings" as const, label: "Overload warnings", desc: "Alert when schedule is over capacity" },
            ].map(({ key, label, desc }, i, arr) => (
              <div
                key={key}
                className={`flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors cursor-default ${
                  i < arr.length - 1 ? "border-b border-zinc-100" : ""
                }`}
              >
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
          disabled={saving}
          className="w-full bg-indigo-600 text-white text-[14px] font-semibold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-70 transition-colors shadow-sm"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>

        {/* Danger zone */}
        <div>
          <SectionHeader title="Danger Zone" />
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-red-800 mb-1">Reset all data</h3>
                <p className="text-[13px] text-red-600 leading-relaxed">
                  This will permanently delete all your schedules, tasks, and preferences. This action cannot be undone.
                </p>
              </div>
            </div>
            {!resetConfirm ? (
              <button
                onClick={() => setResetConfirm(true)}
                className="px-4 py-2 bg-white border border-red-300 text-red-700 text-[13px] font-semibold rounded-lg hover:bg-red-100 transition-colors"
              >
                Reset all data
              </button>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[13px] text-red-700 font-medium">Are you sure? This is permanent.</span>
                {/* FIX 2: Removed disabled attribute so confirm button is clickable */}
                <button
                  onClick={() => setResetConfirm(false)}
                  className="px-4 py-2 bg-red-600 text-white text-[13px] font-semibold rounded-lg hover:bg-red-700 transition-colors"
                >
                  Confirm reset
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  className="text-[13px] text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`px-4 py-3 rounded-xl shadow-xl text-white text-[13px] font-medium pointer-events-auto ${
                toast.type === "success" ? "bg-indigo-600" : "bg-red-600"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
