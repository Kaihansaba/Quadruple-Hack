"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clearComparisonHistory,
  COMPARISON_HISTORY_EVENT,
  readComparisonHistory,
  type ComparisonHistoryItem
} from "@/lib/comparison-history";

export function HistorySidebar() {
  const [items, setItems] = useState<ComparisonHistoryItem[]>([]);

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

  return (
    <aside className="no-print fixed left-0 top-0 z-20 hidden h-screen w-72 border-r border-zinc-800 bg-zinc-950/95 px-3 py-4 lg:flex lg:flex-col">
      <div className="mb-4 flex items-center justify-between px-2">
        <Link href="/" className="text-sm font-semibold text-white">
          Verdict
        </Link>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearComparisonHistory}
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Clear
          </button>
        )}
      </div>

      <Link
        href="/"
        className="mb-4 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
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
    </aside>
  );
}

function HistoryRow({ item }: { item: ComparisonHistoryItem }) {
  return (
    <Link
      href={item.href}
      className="block rounded-lg px-2 py-2 text-sm transition-colors hover:bg-zinc-900"
      title={item.title}
    >
      <div className="truncate text-zinc-200">{item.title}</div>
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
