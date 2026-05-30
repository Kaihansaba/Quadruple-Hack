"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { redistributeWeight } from "@/lib/engine/decision-engine";
import { parseSessionData } from "@/lib/session-data";
import type { DecisionEngineResult, Criterion } from "@/lib/engine/types";
import type { ClarifyResponse, ReweightBody, ChatBody } from "@/lib/api-types";
import type { Call1Output } from "@/lib/prompts";

type Product = { id: string; name: string };

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444"];

// ── helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  if (v >= 0.7) return "bg-green-500/20 text-green-300";
  if (v >= 0.4) return "bg-yellow-500/20 text-yellow-300";
  return "bg-red-500/20 text-red-300";
}

function pct(v: number) {
  return Math.round(v * 100);
}

// ── main page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [result, setResult] = useState<DecisionEngineResult | null>(null);
  const [criteria, setCriteria] = useState<Call1Output["criteria"]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [verdict, setVerdict] = useState("");
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [reweightPending, setReweightPending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // store the full engine input for re-weighting
  const engineInputRef = useRef<ClarifyResponse | null>(null);

  useEffect(() => {
    const raw = searchParams.get("data");
    if (!raw) return;
    try {
      const parsed = parseSessionData<ClarifyResponse>(raw);
      engineInputRef.current = parsed;
      setResult(parsed.result);
      setCriteria(parsed.criteria);
      setProducts(parsed.products);
      setVerdict(parsed.verdict);
      const w: Record<string, number> = {};
      for (const c of parsed.criteria) {
        if (c.type === "soft") w[c.id] = c.weight ?? 0;
      }
      setWeights(w);
    } catch {
      // ignore
    }
  }, [searchParams]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── reweight ────────────────────────────────────────────────────────────────

  const reweight = useCallback(
    async (newWeights: Record<string, number>) => {
      if (!engineInputRef.current || reweightPending) return;
      setReweightPending(true);
      const prev = engineInputRef.current;

      const body: ReweightBody & {
        engineInput: ClarifyResponse["result"] & { products: Product[]; criteria: Criterion[] };
        criteria: Criterion[];
      } = {
        weights: newWeights,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        engineInput: { ...prev.result, products: prev.products, criteria: prev.criteria } as any,
        criteria: prev.criteria as Criterion[]
      };

      try {
        const res = await fetch(`/api/comparisons/${id}/reweight`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setResult(data.result);
        setCriteria(data.criteria);
      } catch {
        // silent
      } finally {
        setReweightPending(false);
      }
    },
    [id, reweightPending]
  );

  function onSliderChange(criterionId: string, value: number) {
    const newWeights = redistributeWeight(weights, criterionId, value);
    setWeights(newWeights);
  }

  function onSliderCommit() {
    reweight(weights);
  }

  // ── chat ────────────────────────────────────────────────────────────────────

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading || !engineInputRef.current) return;
    setChatInput("");
    setChatLoading(true);

    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);

    const prev = engineInputRef.current;
    const body: ChatBody & {
      engineInput: unknown;
      criteria: unknown;
      currentWeights: Record<string, number>;
      history: typeof messages;
    } = {
      message: text,
      engineInput: { ...prev.result, products: prev.products, criteria: prev.criteria },
      criteria: prev.criteria,
      currentWeights: weights,
      history: messages.slice(-6)
    };

    try {
      const res = await fetch(`/api/comparisons/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
      if (data.result) {
        setResult(data.result);
        setCriteria(data.criteria);
        const newW: Record<string, number> = {};
        for (const c of data.criteria) {
          if (c.type === "soft") newW[c.id] = c.weight ?? 0;
        }
        setWeights(newW);
      }
    } catch {
      setMessages([...nextMessages, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (!result) {
    return (
      <main className="min-h-screen flex items-center justify-center text-zinc-400">
        Loading results…
      </main>
    );
  }

  const softCriteria = criteria.filter((c) => c.type === "soft");
  const ranked = result.rankings.filter((r) => !r.eliminated);
  const allEliminated = ranked.length === 0;

  // All-eliminated view
  if (allEliminated) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-lg w-full space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mb-4">
              <span className="text-red-400 text-2xl">✕</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">No vendor passed the requirements</h1>
            <p className="text-zinc-400 text-sm">
              {products.map((p) => p.name).join(" and ")} were both eliminated before scoring.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
            {result.eliminated.map((e) => (
              <div key={`${e.productId}-${e.criterionId}`} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center bg-red-500/10 text-red-400 text-xs shrink-0">✕</span>
                  <div>
                    <p className="text-white text-sm font-medium">{e.productName}</p>
                    <p className="text-zinc-400 text-xs mt-0.5">
                      Failed must-have: <span className="text-red-300">{e.criterionName}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {verdict && (
            <div className="px-5 py-4 rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-300 text-sm leading-relaxed">
              {verdict}
            </div>
          )}

          <div className="text-center">
            <a
              href="/"
              className="inline-block px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors"
            >
              ← Start a new comparison
            </a>
          </div>
        </div>
      </main>
    );
  }
  const eliminated = result.rankings.filter((r) => r.eliminated);

  // Radar data
  const radarData = softCriteria.map((c) => {
    const entry: Record<string, number | string> = { criterion: c.name };
    for (const p of products) {
      const cell = result.cells.find((cl) => cl.productId === p.id && cl.criterionId === c.id);
      entry[p.name] = pct(cell?.normalizedValue ?? 0);
    }
    return entry;
  });

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <p className="text-zinc-500 text-sm mb-1">Step 3 of 3 — Results</p>
          <h1 className="text-2xl font-bold text-white">
            {products.map((p) => p.name).join(" vs ")}
          </h1>
        </div>

        {/* Leaderboard */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold">Ranking</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {ranked.map((r, i) => (
              <div key={r.productId} className="flex items-center gap-4 px-6 py-4">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: COLORS[i] + "33", color: COLORS[i] }}
                >
                  {i + 1}
                </span>
                <span className="text-white font-medium flex-1">{r.productName}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct(r.score)}%`, background: COLORS[i] }}
                    />
                  </div>
                  <span className="text-white font-bold w-8 text-right">{pct(r.score)}</span>
                </div>
                {result.nearTie && i < 2 && (
                  <span className="text-xs text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded-full">
                    near tie
                  </span>
                )}
              </div>
            ))}
            {eliminated.map((r) => (
              <div key={r.productId} className="flex items-center gap-4 px-6 py-4 opacity-50">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-red-500/10 text-red-400">
                  ✕
                </span>
                <span className="text-zinc-400 flex-1 line-through">{r.productName}</span>
                <span className="text-xs text-red-400">
                  {result.eliminated.find((e) => e.productId === r.productId)?.criterionName}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Scorecard */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Scorecard</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-2.5 text-left text-zinc-500 font-normal">Criterion</th>
                    {ranked.map((r, i) => (
                      <th key={r.productId} className="px-4 py-2.5 text-center font-medium" style={{ color: COLORS[i] }}>
                        {r.productName.split(" ")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {softCriteria.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 text-zinc-300">{c.name}</td>
                      {ranked.map((r) => {
                        const cell = result.cells.find(
                          (cl) => cl.productId === r.productId && cl.criterionId === c.id
                        );
                        const norm = cell?.normalizedValue ?? 0;
                        return (
                          <td key={r.productId} className="px-4 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${scoreColor(norm)}`}>
                              {pct(norm)}
                            </span>
                            {cell?.sourcesDisagree && (
                              <span className="ml-1 text-yellow-400 text-xs" title="Sources disagree">⚠</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Radar */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-white font-semibold mb-4">Shape of strengths</h2>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#27272a" />
                <PolarAngleAxis dataKey="criterion" tick={{ fill: "#71717a", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                  labelStyle={{ color: "#fafafa" }}
                />
                {ranked.map((r, i) => (
                  <Radar
                    key={r.productId}
                    name={r.productName}
                    dataKey={r.productName}
                    stroke={COLORS[i]}
                    fill={COLORS[i]}
                    fillOpacity={0.08}
                    strokeWidth={2}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 mt-2 justify-center">
              {ranked.map((r, i) => (
                <div key={r.productId} className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span className="w-3 h-0.5 rounded" style={{ background: COLORS[i] }} />
                  {r.productName}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Verdict */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-white font-semibold mb-3">Verdict</h2>
          <p className="text-zinc-300 leading-relaxed whitespace-pre-line">{verdict}</p>

          {result.sensitivity && (
            <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-300">
              <span className="text-yellow-400 mt-0.5">⚡</span>
              <span>
                If <strong>{result.sensitivity.criterionName}</strong> weight increased from{" "}
                {pct(result.sensitivity.currentWeight)}% to {pct(result.sensitivity.tippingWeight)}%,{" "}
                <strong>{result.sensitivity.overtakingProductName}</strong> would overtake.
              </span>
            </div>
          )}
        </section>

        {/* Weight sliders */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-white font-semibold mb-1">Adjust weights</h2>
          <p className="text-zinc-500 text-xs mb-5">Drag to re-run scoring live</p>
          <div className="space-y-4">
            {softCriteria.map((c) => (
              <div key={c.id} className="flex items-center gap-4">
                <span className="text-zinc-400 text-sm w-40 shrink-0 truncate">{c.name}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={weights[c.id] ?? 0}
                  onChange={(e) => onSliderChange(c.id, parseFloat(e.target.value))}
                  onMouseUp={onSliderCommit}
                  onTouchEnd={onSliderCommit}
                  className="flex-1 accent-green-500"
                />
                <span className="text-white text-sm font-medium w-10 text-right">
                  {pct(weights[c.id] ?? 0)}%
                </span>
              </div>
            ))}
          </div>
          {reweightPending && (
            <p className="mt-3 text-zinc-500 text-xs">Recalculating…</p>
          )}
        </section>

        {/* Chat */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold">Refine</h2>
            <p className="text-zinc-500 text-xs mt-0.5">
              Ask questions or say "what if budget didn't matter?"
            </p>
          </div>

          {messages.length > 0 && (
            <div className="px-6 py-4 space-y-4 max-h-80 overflow-y-auto">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-green-600 text-white rounded-br-sm"
                        : "bg-zinc-800 text-zinc-200 rounded-bl-sm"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          <div className="px-4 py-3 border-t border-zinc-800 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="What if security mattered more?"
              disabled={chatLoading}
              className="flex-1 bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2 text-sm outline-none border border-zinc-700 focus:border-zinc-500 transition-colors"
            />
            <button
              onClick={sendChat}
              disabled={!chatInput.trim() || chatLoading}
              className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm transition-colors"
            >
              {chatLoading ? "…" : "→"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
