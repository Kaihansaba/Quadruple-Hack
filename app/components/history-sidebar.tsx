"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clearComparisonHistory,
  COMPARISON_HISTORY_EVENT,
  readComparisonHistory,
  type ComparisonHistoryItem
} from "@/lib/comparison-history";
import { ThemeToggle } from "./theme-toggle";

const PROFILE_STORAGE_KEY = "verdict:profile-edits:v1";

export function HistorySidebar({
  isOpen,
  onClose,
  onOpen
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const [items, setItems] = useState<ComparisonHistoryItem[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("Kaihan saba");

  useEffect(() => {
    function refresh() {
      setItems(readComparisonHistory());
    }

    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(COMPARISON_HISTORY_EVENT, refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(COMPARISON_HISTORY_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    function loadProfileName() {
      try {
        const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { contactName?: string; companyName?: string };
        const nextName = parsed.contactName?.trim() || parsed.companyName?.trim();
        if (nextName) setProfileName(nextName);
      } catch {
        // keep fallback
      }
    }

    loadProfileName();
    window.addEventListener("storage", loadProfileName);
    return () => window.removeEventListener("storage", loadProfileName);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className={`no-print fixed left-3 top-3 z-30 hidden h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 light:border-zinc-200 bg-zinc-950 light:bg-white text-zinc-300 light:text-zinc-600 transition-all hover:border-zinc-600 hover:text-white light:hover:border-zinc-400 light:hover:text-zinc-900 lg:flex ${
          isOpen ? "pointer-events-none -translate-x-14 opacity-0" : "translate-x-0 opacity-100"
        }`}
        aria-label="Open history sidebar"
      >
        ☰
      </button>

      <aside
        className={`no-print fixed left-0 top-0 z-20 hidden h-screen w-72 border-r border-zinc-800 light:border-zinc-200 bg-zinc-950/95 light:bg-white/95 px-3 py-4 transition-transform duration-300 lg:flex lg:flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between px-2">
          <Link href="/home" className="text-sm font-semibold text-white light:text-zinc-900">
            Verdict
          </Link>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={clearComparisonHistory}
                className="text-xs text-zinc-500 transition-colors hover:text-zinc-300 light:hover:text-zinc-700"
              >
                Clear
              </button>
            )}
            <ThemeToggle />
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-900 light:hover:bg-zinc-100 hover:text-zinc-200 light:hover:text-zinc-700"
              aria-label="Close history sidebar"
            >
              ×
            </button>
          </div>
        </div>

        <Link
          href="/home"
          className="mb-4 rounded-lg border border-zinc-800 light:border-zinc-200 px-3 py-2 text-sm text-zinc-200 light:text-zinc-700 transition-colors hover:border-zinc-600 light:hover:border-zinc-400 hover:bg-zinc-900 light:hover:bg-zinc-50"
        >
          New comparison
        </Link>

        <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Previous comparisons
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <p className="px-2 py-3 text-sm leading-relaxed text-zinc-500">
              Completed and in-progress comparisons will appear here.
            </p>
          ) : (
            items.map((item) => <HistoryRow key={item.id} item={item} />)
          )}
        </div>

        <div className="relative border-t border-zinc-800 light:border-zinc-200 pt-3">
          {profileOpen && (
            <div className="absolute bottom-14 left-0 right-0 z-30 rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-950 light:bg-white p-2 shadow-2xl shadow-black/20">
              <div className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar name={profileName} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white light:text-zinc-900">{profileName}</div>
                  <div className="text-xs text-zinc-500">Profile</div>
                </div>
              </div>
              <div className="h-px bg-zinc-800 light:bg-zinc-200" />
              <Link
                href="/profile"
                onClick={() => setProfileOpen(false)}
                className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-200 light:text-zinc-700 transition-colors hover:bg-zinc-900 light:hover:bg-zinc-50"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-600 light:border-zinc-300 text-xs">
                  i
                </span>
                Profile
              </Link>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-zinc-500"
                disabled
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-700 light:border-zinc-300 text-xs">
                  ⚙
                </span>
                Settings
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setProfileOpen((current) => !current)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-zinc-900 light:hover:bg-zinc-50"
            aria-expanded={profileOpen}
            aria-label="Open profile menu"
          >
            <Avatar name={profileName} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-100 light:text-zinc-800">{profileName}</div>
              <div className="text-xs text-zinc-500">Profile</div>
            </div>
            <span className="text-lg text-zinc-500">›</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "P";

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
      {initials}
    </span>
  );
}

function HistoryRow({ item }: { item: ComparisonHistoryItem }) {
  return (
    <Link
      href={item.href}
      className="block rounded-lg px-2 py-2 text-sm transition-colors hover:bg-zinc-900 light:hover:bg-zinc-50"
      title={item.title}
    >
      <div className="truncate text-zinc-200 light:text-zinc-700">{item.title}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span>{item.status === "results" ? "Results" : "Clarify"}</span>
        <time dateTime={item.updatedAt}>{formatTime(item.updatedAt)}</time>
      </div>
    </Link>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
