"use client";

import { useState } from "react";
import { createTask, reorganize } from "@/lib/api";

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const PRIORITIES = ["critical", "high", "medium", "low"] as const;

interface Props {
  /** Called after the task is created and the schedule reorganized. */
  onAdded?: (message: string) => void;
  onError?: (message: string) => void;
}

/**
 * One-tap task add for the dashboard: floating + button → title, duration,
 * priority (defaults to medium) → saved and slotted into the week immediately.
 */
export default function QuickAddTask({ onAdded, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(30);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !saving;

  function reset() {
    setTitle("");
    setDuration(30);
    setPriority("medium");
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await createTask({
        title: title.trim(),
        duration_minutes: duration,
        deadline: null,
        priority,
        energy_level: "medium",
        is_flexible: true,
        timing_preference: "ai_decide",
      });
      let placed = true;
      try {
        const result = await reorganize("quick_add");
        placed = result.tasks_dropped.length === 0;
      } catch {
        // Task saved; placement will happen on next reorganize
      }
      setOpen(false);
      reset();
      onAdded?.(
        placed
          ? `"${title.trim()}" added and scheduled`
          : `"${title.trim()}" added — no free slot this week yet`
      );
    } catch (e) {
      onError?.(`Couldn't add task: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Add a task"
        className="fixed bottom-20 sm:bottom-8 right-4 sm:right-6 z-40 w-14 h-14 rounded-full bg-indigo-600 text-white text-3xl font-light leading-none shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all flex items-center justify-center"
      >
        +
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] bg-black/30 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[15px] font-semibold text-zinc-900">Add a task</p>
              <button
                type="button"
                onClick={() => { setOpen(false); reset(); }}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-xl"
              >
                ×
              </button>
            </div>

            <input
              type="text"
              autoFocus
              placeholder="What needs to get done?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-[15px] text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-indigo-300 bg-white mb-4"
            />

            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-2">Duration</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {DURATION_OPTIONS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  className={`px-3.5 py-2 rounded-full text-[13px] font-medium border transition-all ${
                    duration === m
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  {m < 60 ? `${m}m` : `${m / 60}h${m % 60 ? ` ${m % 60}m` : ""}`}
                </button>
              ))}
            </div>

            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-2">Priority</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-3.5 py-2 rounded-full text-[13px] font-medium border capitalize transition-all ${
                    priority === p
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="w-full py-3 rounded-xl text-[14px] font-semibold bg-indigo-600 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
            >
              {saving ? "Adding..." : "Add to my week"}
            </button>
            <p className="text-[11px] text-zinc-400 text-center mt-2">
              Sunday finds the best open slot automatically.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
