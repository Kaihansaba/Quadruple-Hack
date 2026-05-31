"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, animate } from "framer-motion";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { redistributeWeight } from "@/lib/engine/decision-engine";
import { parseSessionData, readSessionData, saveSessionData } from "@/lib/session-data";
import { upsertComparisonHistory } from "@/lib/comparison-history";
import { DecisionMemo, type MemoData } from "@/app/components/DecisionMemo";
import { DEMO_PROFILE } from "@/lib/demo-profile";
import type { DecisionEngineInput, DecisionEngineResult, Criterion } from "@/lib/engine/types";
import type {
  ChatBody,
  ClarifyResponse,
  ReweightBody,
  RobustnessBody,
  RobustnessResponse
} from "@/lib/api-types";
import type { Call1Output } from "@/lib/prompts";

type Product = { id: string; name: string };

const COLORS = ["#2dd4bf", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444"];
const MIN_ROBUSTNESS_BAND = 0.15;
const MAX_ROBUSTNESS_BAND = 0.6;
const DEFAULT_PRIORITY_FIRMNESS = 44;

// ── helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  if (v >= 0.7) return "bg-teal-500/20 text-teal-300";
  if (v >= 0.4) return "bg-yellow-500/20 text-yellow-300";
  return "bg-red-500/20 text-red-300";
}

function pct(v: number) {
  return Math.round(v * 100);
}

function formatScore(v: number) {
  return `${pct(v)}`;
}

function formatRank(rank: number) {
  if (rank === 1) return "#1";
  if (rank === 2) return "#2";
  if (rank === 3) return "#3";
  return `#${rank}`;
}

function firmnessToBand(firmness: number) {
  return MAX_ROBUSTNESS_BAND - (firmness / 100) * (MAX_ROBUSTNESS_BAND - MIN_ROBUSTNESS_BAND);
}

function buildWhyNotReason({
  productId,
  productName,
  winner,
  result,
  criteria
}: {
  productId: string;
  productName: string;
  winner: { productId: string; productName: string; score: number };
  result: DecisionEngineResult;
  criteria: Call1Output["criteria"];
}) {
  const elimination = result.eliminated.find((item) => item.productId === productId);
  if (elimination) {
    return `${productName} was filtered out because it failed the must-have requirement "${elimination.criterionName}".`;
  }

  const productScore = result.rankings.find((ranking) => ranking.productId === productId)?.score ?? 0;
  const gap = Math.max(0, winner.score - productScore);
  const winnerContrib = result.contributions[winner.productId] ?? {};
  const productContrib = result.contributions[productId] ?? {};
  const drivers = criteria
    .filter((criterion) => criterion.type === "soft")
    .map((criterion) => ({
      name: criterion.name,
      gap: (winnerContrib[criterion.id] ?? 0) - (productContrib[criterion.id] ?? 0)
    }))
    .filter((item) => item.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);

  if (drivers.length === 0) {
    return `${productName} is close, but ${winner.productName} has the stronger overall score by ${pct(gap)} points.`;
  }

  return `${productName} trails ${winner.productName} by ${pct(gap)} points, mainly on ${drivers
    .map((driver) => driver.name)
    .join(" and ")}.`;
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
  const [expandedWhyNot, setExpandedWhyNot] = useState<string | null>(null);
  const [displayScores, setDisplayScores] = useState<Record<string, number>>({});
  const [robustness, setRobustness] = useState<RobustnessResponse | null>(null);
  const [priorityFirmness, setPriorityFirmness] = useState(DEFAULT_PRIORITY_FIRMNESS);
  const [robustnessPending, setRobustnessPending] = useState(false);
  const [printMemo, setPrintMemo] = useState<MemoData | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const skipInitialRobustnessRef = useRef(true);

  // store the full engine input for re-weighting
  const engineInputRef = useRef<ClarifyResponse | null>(null);

  useEffect(() => {
    const raw = searchParams.get("data");
    try {
      const parsed = raw ? parseSessionData<ClarifyResponse>(raw) : readSessionData<ClarifyResponse>(id);
      if (!parsed) return;
      saveSessionData(id, parsed);
      engineInputRef.current = parsed;
      setResult(parsed.result);
      setCriteria(parsed.criteria);
      setProducts(parsed.products);
      setVerdict(parsed.verdict);
      setRobustness(parsed.robustness ?? null);
      const w: Record<string, number> = {};
      for (const c of parsed.criteria) {
        if (c.type === "soft") w[c.id] = c.weight ?? 0;
      }
      setWeights(w);
      upsertComparisonHistory({
        id,
        title: parsed.products.map((product) => product.name).join(" vs "),
        href: `/compare/${id}/results`,
        status: "results"
      });
    } catch {
      // ignore
    }
  }, [searchParams]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!printMemo) return;
    const frame = window.requestAnimationFrame(() => window.print());
    return () => window.cancelAnimationFrame(frame);
  }, [printMemo]);

  useEffect(() => {
    if (!result) return;
    const controls = result.rankings
      .filter((r) => !r.eliminated)
      .map((r) =>
        animate(0, Math.round(r.score * 100), {
          duration: 0.9,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) =>
            setDisplayScores((prev) => ({ ...prev, [r.productId]: Math.round(v) }))
        })
      );
    return () => controls.forEach((c) => c.stop());
  }, [result]);

  useEffect(() => {
    if (skipInitialRobustnessRef.current) {
      skipInitialRobustnessRef.current = false;
      return;
    }

    const engineInput = engineInputRef.current?.engineInput;
    if (!engineInput) return;

    const timeout = window.setTimeout(async () => {
      setRobustnessPending(true);
      const body: RobustnessBody = {
        engineInput,
        weights,
        band: firmnessToBand(priorityFirmness)
      };

      try {
        const res = await fetch(`/api/comparisons/${id}/robustness`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setRobustness(data.robustness ?? null);
      } catch {
        // Keep the current robustness readout if recomputing fails.
      } finally {
        setRobustnessPending(false);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [id, priorityFirmness, weights]);

  // ── reweight ────────────────────────────────────────────────────────────────

  const reweight = useCallback(
    async (newWeights: Record<string, number>) => {
      if (!engineInputRef.current || reweightPending) return;
      setReweightPending(true);
      const prev = engineInputRef.current;
      const engineInput = prev.engineInput;
      if (!engineInput) {
        setReweightPending(false);
        return;
      }

      const body: ReweightBody & {
        engineInput: DecisionEngineInput;
        criteria: Criterion[];
      } = {
        weights: newWeights,
        engineInput,
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
        setRobustness(data.robustness ?? null);
        engineInputRef.current = {
          ...prev,
          result: data.result,
          criteria: data.criteria,
          products: data.products,
          robustness: data.robustness,
          engineInput: { ...engineInput, criteria: data.criteria }
        };
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

  function buildMemoData(): MemoData {
    if (!result || products.length === 0 || criteria.length === 0) {
      throw new Error("Missing result data for decision memo.");
    }

    const activeRankings = result.rankings.filter((ranking) => !ranking.eliminated);
    const selectedRanking = activeRankings[0];
    if (!selectedRanking) {
      throw new Error("Decision memo requires a recommended vendor.");
    }

    const runnerUpRanking = activeRankings[1];
    const memoVendors = products.map((product) => {
      const ranking = result.rankings.find((item) => item.productId === product.id);
      return {
        id: product.id,
        name: product.name,
        estimatedCost: "Not finalized",
        compositeScore: ranking?.score ?? 0
      };
    });
    const memoCriteria = criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      weight: criterion.type === "soft" ? criterion.weight ?? 0 : 0,
      direction: criterion.direction,
      rationale:
        criterion.type === "hard"
          ? "Treated as a mandatory requirement before weighted scoring."
          : `Weighted at ${pct(criterion.weight ?? 0)}% based on the buyer's stated priorities.`,
      fromProfile: DEMO_PROFILE.default_weights[criterion.id] !== undefined
    }));
    const memoScores = result.cells
      .filter((cell) => products.some((product) => product.id === cell.productId))
      .filter((cell) => criteria.some((criterion) => criterion.id === cell.criterionId))
      .map((cell) => ({
        vendorId: cell.productId,
        criterionId: cell.criterionId,
        normalizedScore: cell.normalizedValue ?? 0,
        sourcesDisagree: cell.sourcesDisagree
      }));
    const alternativeReasons = result.rankings
      .filter((ranking) => ranking.productId !== selectedRanking.productId)
      .map((ranking) => ({
        vendorId: ranking.productId,
        reason: buildWhyNotReason({
          productId: ranking.productId,
          productName: ranking.productName,
          winner: selectedRanking,
          result,
          criteria
        })
      }));
    const memoSources = result.cells
      .filter((cell) => cell.sourceUrl)
      .map((cell, index) => {
        const vendor = products.find((product) => product.id === cell.productId);
        const criterion = criteria.find((item) => item.id === cell.criterionId);
        return {
          id: `${cell.productId}-${cell.criterionId}-${index}`,
          label: `${vendor?.name ?? cell.productId} evidence for ${criterion?.name ?? cell.criterionId}`,
          url: cell.sourceUrl ?? "",
          sourceType: cell.sourceType ?? "vendor_claim",
          confidence: cell.confidence,
          relatedVendorId: cell.productId,
          relatedCriterionId: cell.criterionId,
          sourcesDisagree: cell.sourcesDisagree
        };
      });
    const lowConfidenceCell = result.cells
      .filter((cell) => !cell.missing)
      .sort((a, b) => a.confidence - b.confidence)[0];
    const lowConfidenceVendor = lowConfidenceCell
      ? products.find((product) => product.id === lowConfidenceCell.productId)
      : null;
    const lowConfidenceCriterion = lowConfidenceCell
      ? criteria.find((criterion) => criterion.id === lowConfidenceCell.criterionId)
      : null;

    return {
      title: "Vendor Selection Decision Memo",
      to: `${DEMO_PROFILE.name} leadership team`,
      from: "Procurement evaluation team",
      date: new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
      }),
      subject: `${products.map((product) => product.name).join(" vs ")} selection`,
      decisionStatus: "Recommended for Approval",
      preparedBy: DEMO_PROFILE.name,
      totalEstimatedCost: "Pending final vendor quote",
      selectedVendorId: selectedRanking.productId,
      criteria: memoCriteria,
      vendors: memoVendors,
      scores: memoScores,
      contributions: result.contributions,
      robustness: {
        winFrequency: robustness?.winFrequency ?? { [selectedRanking.productId]: 1 },
        worstCaseRank: robustness?.worstCaseRank ?? { [selectedRanking.productId]: 1 },
        flipThreshold: robustness?.flipThreshold ?? null,
        flipCriterionName: result.sensitivity?.criterionName ?? null,
        runnerUpVendorId: result.sensitivity?.overtakingProductId ?? runnerUpRanking?.productId ?? null
      },
      alternativeReasons,
      riskSummary:
        lowConfidenceCell && lowConfidenceVendor && lowConfidenceCriterion
          ? `${lowConfidenceVendor.name} has the lowest-confidence evidence on ${lowConfidenceCriterion.name}; procurement should validate this point before final approval.`
          : "No material low-confidence source risk was identified in the available evidence.",
      sources: memoSources
    };
  }

  function exportPdf() {
    try {
      setPrintMemo(buildMemoData());
    } catch (error) {
      console.warn("Falling back to screen print because decision memo data could not be built.", error);
      setPrintMemo(null);
      window.setTimeout(() => window.print(), 0);
    }
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
    const engineInput = prev.engineInput;
    if (!engineInput) {
      setMessages([...nextMessages, { role: "assistant", content: "This comparison is missing the original scoring data, so I can't refine it. Please rerun the comparison." }]);
      setChatLoading(false);
      return;
    }
    const body: ChatBody & {
      engineInput: unknown;
      criteria: unknown;
      currentWeights: Record<string, number>;
      history: typeof messages;
    } = {
      message: text,
      engineInput,
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
        engineInputRef.current = {
          ...prev,
          result: data.result,
          criteria: data.criteria,
          products: data.products ?? prev.products,
          engineInput: { ...engineInput, criteria: data.criteria }
        };
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

          <div className="no-print text-center">
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
  const winner = ranked[0];
  const alternatives = result.rankings.filter((ranking) => ranking.productId !== winner.productId);
  const runnerUp = ranked[1];
  const winnerFrequency =
    robustness?.baseWinner === winner.productId ? robustness.winFrequency?.[robustness.baseWinner] : undefined;
  const winnerConfidenceText =
    typeof winnerFrequency === "number"
      ? `Wins in ${pct(winnerFrequency)}% of reasonable priority scenarios.`
      : null;
  const winnerWorstCaseRank = robustness?.worstCaseRank?.[winner.productId];
  const safestChoiceText =
    typeof winnerWorstCaseRank === "number" && winnerWorstCaseRank <= 2
      ? `Safest choice: even in its worst case across these scenarios, ${winner.productName} never ranks below ${formatRank(winnerWorstCaseRank)}.`
      : null;
  const flipThresholdText =
    typeof robustness?.flipThreshold === "number" && runnerUp
      ? `It would take roughly a ${pct(robustness.flipThreshold)}% priority shift before ${runnerUp.productName} overtakes ${winner.productName}.`
      : null;
  const canAdjustRobustness = Boolean(engineInputRef.current?.engineInput);

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
    <>
      <style>{`
        .memo-print-root {
          display: none;
        }

        @media print {
          .results-screen-export {
            display: none !important;
          }

          .memo-print-root {
            display: block !important;
          }
        }
      `}</style>
      <main className={`${printMemo ? "results-screen-export " : ""}min-h-screen px-4 py-10`}>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-zinc-500 text-sm mb-1">Step 3 of 3 — Results</p>
            <h1 className="text-2xl font-bold text-white">
              {products.map((p) => p.name).join(" vs ")}
            </h1>
          </div>
          <button
            type="button"
            onClick={exportPdf}
            className="no-print rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
          >
            Export PDF
          </button>
        </div>

        <section className="rounded-3xl border border-teal-500/25 bg-teal-500/10 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-teal-300">
                Best option
              </p>
              <h2 className="text-3xl font-bold text-white">{winner.productName}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                {winner.productName} has the strongest computed fit with a score of{" "}
                <span className="font-semibold text-white">{formatScore(winner.score)}</span>.
              </p>
            </div>
            <div className="rounded-2xl border border-teal-500/25 bg-teal-500/10 px-5 py-4 text-center">
              <div className="text-4xl font-bold text-white">{formatScore(winner.score)}</div>
              <div className="mt-1 text-xs uppercase tracking-wide text-teal-300">Composite</div>
            </div>
          </div>

          {alternatives.length > 0 && (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {alternatives.map((alternative) => {
                const isOpen = expandedWhyNot === alternative.productId;
                return (
                  <button
                    key={alternative.productId}
                    type="button"
                    onClick={() => setExpandedWhyNot(isOpen ? null : alternative.productId)}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-left transition-colors hover:border-zinc-600"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">Why not {alternative.productName}?</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Score {formatScore(alternative.score)}
                          {alternative.eliminated ? " · eliminated" : ""}
                        </p>
                      </div>
                      <span className="text-xl text-zinc-500">{isOpen ? "−" : "+"}</span>
                    </div>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="mt-3 overflow-hidden text-sm leading-6 text-zinc-300"
                        >
                          {buildWhyNotReason({
                            productId: alternative.productId,
                            productName: alternative.productName,
                            winner,
                            result,
                            criteria
                          })}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 * 0.08, duration: 0.45, ease: "easeOut" }}
        >
          {/* Leaderboard */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Ranking</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {ranked.map((r, i) => {
                const rowContent = (
                  <>
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: COLORS[i] + "33", color: COLORS[i] }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-white font-medium flex-1">{r.productName}</span>
                    {i === 0 ? (
                      <span className="ml-auto mr-4 text-5xl font-bold tracking-tight text-white">
                        {displayScores[r.productId] ?? pct(r.score)}
                      </span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${displayScores[r.productId] ?? pct(r.score)}%`, background: COLORS[i] }}
                          />
                        </div>
                        <span className="text-white font-bold w-8 text-right">{displayScores[r.productId] ?? pct(r.score)}</span>
                      </div>
                    )}
                    {result.nearTie && i < 2 && (
                      <span className="text-xs text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded-full">
                        near tie
                      </span>
                    )}
                  </>
                );

                return i === 0 ? (
                  <div key={r.productId} className="bg-gradient-to-r from-teal-500/40 via-teal-400/10 to-transparent p-[1px] rounded-2xl">
                    <div className="rounded-2xl bg-zinc-900">
                      <div className="flex items-center gap-4 px-6 py-4">{rowContent}</div>
                      {winnerConfidenceText && (
                        <div className="px-6 pb-4 -mt-1">
                          <span className="inline-flex rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-300">
                            {winnerConfidenceText}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={r.productId} className="flex items-center gap-4 px-6 py-4">
                    {rowContent}
                  </div>
                );
              })}
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
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 * 0.08, duration: 0.45, ease: "easeOut" }}
        >
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
        </motion.div>

        {/* Verdict */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2 * 0.08, duration: 0.45, ease: "easeOut" }}
        >
          <section className="no-print rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-white font-semibold mb-3">Verdict</h2>
            <p className="text-zinc-300 leading-relaxed whitespace-pre-line">{verdict}</p>

            {(safestChoiceText || flipThresholdText) && (
              <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-400">
                {safestChoiceText && <p>{safestChoiceText}</p>}
                {flipThresholdText && <p>{flipThresholdText}</p>}
              </div>
            )}

            {canAdjustRobustness && (
              <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="priority-firmness" className="text-sm font-medium text-zinc-200">
                    How firm are your priorities?
                  </label>
                  {robustnessPending && (
                    <span className="text-xs text-zinc-500">Updating confidence…</span>
                  )}
                </div>
                <input
                  id="priority-firmness"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={priorityFirmness}
                  onChange={(event) => setPriorityFirmness(Number(event.target.value))}
                  className="w-full accent-teal-500"
                />
                <div className="mt-1 flex justify-between text-xs text-zinc-500">
                  <span>Flexible</span>
                  <span>Strict</span>
                </div>
              </div>
            )}

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
        </motion.div>

        {/* Weight sliders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3 * 0.08, duration: 0.45, ease: "easeOut" }}
        >
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
                    className="flex-1 accent-teal-500"
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
        </motion.div>

        {/* Chat */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 4 * 0.08, duration: 0.45, ease: "easeOut" }}
        >
          <section className="no-print rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
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
                          ? "bg-teal-600 text-white rounded-br-sm"
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
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-sm transition-colors"
              >
                {chatLoading ? "…" : "→"}
              </button>
            </div>
          </section>
        </motion.div>
        <div className="no-print flex justify-end">
          <button
            type="button"
            onClick={exportPdf}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-500"
          >
            Export result as PDF
          </button>
        </div>
      </div>
      </main>
      <div className="memo-print-root">
        {printMemo && <DecisionMemo memo={printMemo} />}
      </div>
    </>
  );
}
