"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upsertComparisonHistory } from "@/lib/comparison-history";
import type { StartResponse } from "@/lib/api-types";

const SUGGESTIONS = [
  "Compare Salesforce vs HubSpot",
  "Compare AWS vs Azure"
];

const PROFILE_BADGE = "Meridian Software";

export function HomeClient() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/comparisons/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed })
      });
      if (!res.ok) throw new Error(await res.text());
      const data: StartResponse = await res.json();
      const href = `/compare/${data.comparisonId}/clarify?data=${encodeURIComponent(JSON.stringify(data))}`;
      upsertComparisonHistory({
        id: data.comparisonId,
        title: data.products.map((product) => product.name).join(" vs "),
        href,
        status: "clarify"
      });
      router.push(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit(input);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 pb-24">
      <div className="mb-10 flex items-center gap-2 px-3 py-1.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-sm">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        Profile loaded: <strong className="font-semibold">{PROFILE_BADGE}</strong>
      </div>

      <h1 className="text-4xl sm:text-5xl font-bold text-white text-center max-w-2xl leading-tight mb-8">
        Find the best option.
      </h1>

      <form onSubmit={onSubmit} className="w-full max-w-2xl">
        <div className="relative rounded-2xl border border-zinc-700 bg-zinc-900 focus-within:border-zinc-500 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. Compare CrowdStrike vs SentinelOne vs Microsoft Defender"
            rows={2}
            disabled={loading}
            className="w-full bg-transparent text-white placeholder-zinc-500 resize-none px-5 pt-4 pb-14 text-base outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute bottom-3 right-3 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {loading ? "Analyzing..." : "Compare ->"}
          </button>
        </div>
      </form>

      {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-2xl">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => {
              setInput(suggestion);
              inputRef.current?.focus();
            }}
            disabled={loading}
            className="px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-400 text-sm hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mt-10 flex flex-col items-center gap-3 text-zinc-400 text-sm">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-green-500 rounded-full animate-spin" />
          Identifying products and generating criteria...
        </div>
      )}
    </main>
  );
}
