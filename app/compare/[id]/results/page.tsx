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
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import { redistributeWeight } from "@/lib/engine/decision-engine";
import { computeTco, type PricingModel, type TcoProduct } from "@/lib/engine/tco";
import { parseSessionData, readSessionData, saveSessionData } from "@/lib/session-data";
import { upsertComparisonHistory } from "@/lib/comparison-history";
import { useColorScheme } from "@/lib/use-color-scheme";
import { DecisionMemo, type MemoData } from "@/app/components/DecisionMemo";
import { DEMO_PROFILE } from "@/lib/demo-profile";
import ProductLogo from "@/components/ui/product-logo";
import ScoreGauge from "@/components/ui/score-gauge";
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

const COLORS = ["#2d71bf", "#ef4444", "#f59e0b", "#a855f7", "#10b981"];
const MIN_ROBUSTNESS_BAND = 0.15;
const MAX_ROBUSTNESS_BAND = 0.6;
const DEFAULT_PRIORITY_FIRMNESS = 44;

// ── helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  if (v >= 0.7) return "bg-blue-500/20 light:bg-blue-100 text-blue-300 light:text-blue-700";
  if (v >= 0.4) return "bg-yellow-500/20 light:bg-yellow-100 text-yellow-300 light:text-yellow-700";
  return "bg-red-500/20 light:bg-red-100 text-red-300 light:text-red-700";
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
    return `${productName} is a close alternative to ${winner.productName} with no decisive weakness.`;
  }

  return `${productName} falls behind ${winner.productName} mainly on ${drivers
    .map((driver) => driver.name)
    .join(" and ")}.`;
}

// ── price / characteristics helpers ───────────────────────────────────────────

function findPriceCriterion(criteria: Call1Output["criteria"]) {
  return (
    criteria.find((c) => /usd|cost|price|\$|eur|gbp/i.test(c.unit)) ??
    criteria.find((c) => /\b(cost|price|pricing)\b/i.test(c.name)) ??
    null
  );
}

function formatPrice(raw: string | number | boolean | null, unit?: string): string | null {
  if (raw === null || typeof raw === "boolean") return null;
  const str = String(raw).trim();
  if (!str) return null;
  // Already formatted (has a currency symbol or letters) — show as-is.
  if (/[^0-9.,\s-]/.test(str)) return str;
  const num = Number(str.replace(/[, ]/g, ""));
  if (!Number.isFinite(num)) return str;
  const formatted = `$${num.toLocaleString()}`;
  return unit && /year|annual|yr/i.test(unit) ? `${formatted}/yr` : formatted;
}

function isPricingModel(value: unknown): value is PricingModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<PricingModel>;
  return typeof model.type === "string" && typeof model.confidence === "number";
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency && currency !== "unknown" ? currency : "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatTierPrice(tier: NonNullable<PricingModel["tiers"]>[number], model: PricingModel) {
  const period = model.period === "year" ? "yr" : model.period === "month" ? "mo" : "period";
  const unit = model.unit ?? "unit";
  const parts = [];
  if (tier.unit_price > 0) parts.push(`${formatMoney(tier.unit_price, model.currency)}/${unit}/${period}`);
  if ((tier.flat_price ?? 0) > 0) parts.push(`${formatMoney(tier.flat_price ?? 0, model.currency)}/${period}`);
  if (parts.length === 0) return "Free";
  return parts.join(" + ");
}

function pricingSource(product: TcoProduct) {
  const model = product.pricing_model;
  return model?.source_url ?? null;
}

function documentCitationLabel(sourceUrl: string | null) {
  const pageMatch = sourceUrl?.match(/\bp\.?\s*(\d+)\b/i);
  return pageMatch
    ? `From your uploaded document (p.${pageMatch[1]})`
    : "From your uploaded document";
}

function displayTierUsed(product: TcoProduct, tierUsed: string | null) {
  if (tierUsed) return tierUsed;
  const model = product.pricing_model;
  if (!model?.tiers || model.per_unit_price == null) return "Model price";
  const matchingTier = model.tiers.find(
    (tier) => tier.unit_price === model.per_unit_price && (tier.flat_price ?? 0) === (model.base_price ?? 0)
  );
  return matchingTier?.tier_name ?? "Model price";
}

// The recommended product's two strongest soft criteria, with their real values.
function winnerHighlights(
  winnerId: string,
  softCriteria: Call1Output["criteria"],
  cells: DecisionEngineResult["cells"]
) {
  return softCriteria
    .map((c) => {
      const cell = cells.find((cl) => cl.productId === winnerId && cl.criterionId === c.id);
      return {
        name: c.name,
        score: cell?.normalizedValue ?? 0,
        raw: cell && !cell.missing ? cell.rawValue : null
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

// ── main page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const colorScheme = useColorScheme();

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
  const [tcoSeats, setTcoSeats] = useState(40);
  const [tcoGrowthRate, setTcoGrowthRate] = useState(20);
  const [tcoYears, setTcoYears] = useState(3);
  const [tcoSelectedTiers, setTcoSelectedTiers] = useState<Record<string, string>>({});
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
              href="/home"
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

  // Recommendation card: estimated price + a characteristic-based one-liner.
  const priceCriterion = findPriceCriterion(criteria);
  const winnerPriceCell = priceCriterion
    ? result.cells.find((c) => c.productId === winner.productId && c.criterionId === priceCriterion.id)
    : null;
  const estimatedPrice =
    winnerPriceCell && !winnerPriceCell.missing
      ? formatPrice(winnerPriceCell.rawValue, priceCriterion?.unit)
      : null;
  const highlights = winnerHighlights(winner.productId, softCriteria, result.cells);
  const recommendationDescription = highlights.length
    ? `Strongest on ${highlights
        .map((h) => (h.raw !== null && h.raw !== "" ? `${h.name} (${h.raw})` : h.name))
        .join(" and ")}.`
    : `${winner.productName} is the best overall fit for ${DEMO_PROFILE.name}.`;

  // Assumptions window — buyer inputs + data caveats.
  const priorities = [...softCriteria]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 3)
    .map((c) => c.name);
  const mustHaves = criteria.filter((c) => c.type === "hard").map((c) => c.name);
  const dataCaveats = result.cells
    .filter(
      (cell) =>
        products.some((p) => p.id === cell.productId) &&
        criteria.some((cr) => cr.id === cell.criterionId) &&
        (cell.missing || cell.imputed || cell.sourcesDisagree || cell.confidence < 0.5)
    )
    .map((cell) => {
      const p = products.find((pr) => pr.id === cell.productId)?.name ?? cell.productId;
      const cr = criteria.find((c) => c.id === cell.criterionId)?.name ?? cell.criterionId;
      const why = cell.missing || cell.imputed
        ? "estimated (no source found)"
        : cell.sourcesDisagree
          ? "sources disagree"
          : "low-confidence source";
      return `${p} · ${cr}: ${why}`;
    })
    .slice(0, 5);

  // What-would-change window — plain-language flip conditions.
  const whatWouldChange: string[] = [];
  if (result.sensitivity) {
    whatWouldChange.push(
      `If you cared more about ${result.sensitivity.criterionName}, ${result.sensitivity.overtakingProductName} would overtake ${winner.productName}.`
    );
  }
  if (flipThresholdText) whatWouldChange.push(flipThresholdText);
  const lowConfWinnerCell = result.cells
    .filter((cell) => cell.productId === winner.productId && !cell.missing)
    .sort((a, b) => a.confidence - b.confidence)[0];
  if (lowConfWinnerCell && lowConfWinnerCell.confidence < 0.6) {
    const crName = criteria.find((c) => c.id === lowConfWinnerCell.criterionId)?.name;
    if (crName) {
      whatWouldChange.push(
        `${winner.productName}'s ${crName} is based on limited evidence — if it turns out weaker, the ranking could shift.`
      );
    }
  }
  if (whatWouldChange.length === 0) {
    whatWouldChange.push(
      `${winner.productName} leads across the criteria you care about; no single change flips the result.`
    );
  }

  // Radar data
  const radarData = softCriteria.map((c) => {
    const entry: Record<string, number | string> = { criterion: c.name };
    for (const p of products) {
      const cell = result.cells.find((cl) => cl.productId === p.id && cl.criterionId === c.id);
      entry[p.name] = pct(cell?.normalizedValue ?? 0);
    }
    return entry;
  });
  const tcoProducts: TcoProduct[] = (engineInputRef.current?.engineInput?.products ?? []).map((product) => {
    const model = product.rawMetadata?.pricing_model;
    return {
      id: product.id,
      name: product.name,
      pricing_model: isPricingModel(model) ? model : null
    };
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
            <h1 className="text-2xl font-bold text-white light:text-zinc-900">
              {products.map((p) => p.name).join(" vs ")}
            </h1>
          </div>
          <button
            type="button"
            onClick={exportPdf}
            className="no-print rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 light:text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-900 light:hover:bg-zinc-50"
          >
            Export PDF
          </button>
        </div>

        <section className="rounded-3xl border border-blue-500/25 bg-blue-500/10 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-blue-300 light:text-blue-700">
                Recommendation
              </p>
              <div className="flex items-center gap-3">
                <ProductLogo name={winner.productName} size={44} />
                <h2 className="text-3xl font-bold text-white">{winner.productName}</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300 light:text-zinc-700">
                {recommendationDescription}
              </p>
              {estimatedPrice && (
                <p className="mt-3 inline-flex items-baseline gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-1.5">
                  <span className="text-xs uppercase tracking-wide text-blue-300 light:text-blue-700">Estimated price</span>
                  <span className="text-base font-semibold text-white">{estimatedPrice}</span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-center sm:px-2">
              <ScoreGauge value={pct(winner.score)} label="Match" size={170} />
            </div>
          </div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 * 0.08, duration: 0.45, ease: "easeOut" }}
        >
          {/* Leaderboard */}
          <section className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 light:border-zinc-200">
              <h2 className="text-white light:text-zinc-900 font-semibold">Ranking</h2>
            </div>
            <div className="divide-y divide-zinc-800 light:divide-zinc-200">
              {ranked.map((r, i) => {
                const rowContent = (
                  <>
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: COLORS[i] + "33", color: COLORS[i] }}
                    >
                      {i + 1}
                    </span>
                    <ProductLogo name={r.productName} size={28} />
                    <span className="text-white light:text-zinc-900 font-medium flex-1">{r.productName}</span>
                    {i === 0 ? (
                      <span className="ml-auto mr-4 text-5xl font-bold tracking-tight text-white">
                        {displayScores[r.productId] ?? pct(r.score)}
                      </span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 rounded-full bg-zinc-800 light:bg-zinc-200 overflow-hidden">
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
                  <div key={r.productId} className="bg-gradient-to-r from-blue-500/40 via-blue-400/10 to-transparent p-[1px] rounded-2xl">
                    <div className="rounded-2xl bg-zinc-900 light:bg-white">
                      <div className="flex items-center gap-4 px-6 py-4">{rowContent}</div>
                      {winnerConfidenceText && (
                        <div className="px-6 pb-4 -mt-1">
                          <span className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300 light:text-blue-700">
                            {winnerConfidenceText}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={r.productId}>
                    <button
                      type="button"
                      onClick={() => setExpandedWhyNot(expandedWhyNot === r.productId ? null : r.productId)}
                      className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-zinc-800/40 light:hover:bg-zinc-50"
                    >
                      {rowContent}
                      <span className="ml-1 w-4 text-lg leading-none text-zinc-500">
                        {expandedWhyNot === r.productId ? "−" : "+"}
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {expandedWhyNot === r.productId && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <p className="px-6 pb-4 -mt-1 text-sm leading-6 text-zinc-300 light:text-zinc-700">
                            <span className="font-medium text-white">Why not {r.productName}? </span>
                            {buildWhyNotReason({
                              productId: r.productId,
                              productName: r.productName,
                              winner,
                              result,
                              criteria
                            })}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              {eliminated.map((r) => {
                const elimCriterion = result.eliminated.find((e) => e.productId === r.productId)?.criterionName;
                const isOpen = expandedWhyNot === r.productId;
                return (
                  <div key={r.productId}>
                    <button
                      type="button"
                      onClick={() => setExpandedWhyNot(isOpen ? null : r.productId)}
                      className="flex w-full items-center gap-4 px-6 py-4 text-left opacity-60 transition-opacity hover:opacity-100"
                    >
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-red-500/10 text-red-400">
                        ✕
                      </span>
                      <span className="text-zinc-400 light:text-zinc-500 flex-1 line-through">{r.productName}</span>
                      <span className="text-xs text-red-400">{elimCriterion}</span>
                      <span className="ml-1 w-4 text-lg leading-none text-zinc-500">{isOpen ? "−" : "+"}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <p className="px-6 pb-4 -mt-1 text-sm leading-6 text-zinc-300 light:text-zinc-700">
                            {buildWhyNotReason({
                              productId: r.productId,
                              productName: r.productName,
                              winner,
                              result,
                              criteria
                            })}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
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
          <section className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 light:border-zinc-200">
              <h2 className="text-white light:text-zinc-900 font-semibold">Scorecard</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-2.5 text-left text-zinc-500 light:text-zinc-400 font-normal">Criterion</th>
                    {ranked.map((r, i) => (
                      <th key={r.productId} className="px-4 py-2.5 font-medium" style={{ color: COLORS[i] }}>
                        <span className="flex flex-col items-center gap-1.5">
                          <ProductLogo name={r.productName} size={24} />
                          {r.productName.split(" ")[0]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 light:divide-zinc-100">
                  {softCriteria.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 text-zinc-300 light:text-zinc-600">{c.name}</td>
                      {ranked.map((r) => {
                        const cell = result.cells.find(
                          (cl) => cl.productId === r.productId && cl.criterionId === c.id
                        );
                        const norm = cell?.normalizedValue ?? 0;
                        const hasSource = Boolean(cell?.sourceUrl);
                        const isUploadedDocument = cell?.sourceType === "uploaded_document";
                        const cellTitle =
                          cell && !cell.missing
                            ? `${cell.rawValue}${cell.sourceType ? ` · ${cell.sourceType}` : ""}`
                            : "Estimated — no source found";
                        const scoreEl = (
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${scoreColor(norm)} ${
                              hasSource ? "underline decoration-dotted underline-offset-2" : ""
                            }`}
                            title={cellTitle}
                          >
                            {pct(norm)}
                          </span>
                        );
                        return (
                          <td key={r.productId} className="px-4 py-2.5 text-center">
                            {isUploadedDocument ? (
                              <span
                                className="inline-flex items-center gap-1 align-middle transition-opacity hover:opacity-80"
                                title={documentCitationLabel(cell?.sourceUrl ?? null)}
                              >
                                {scoreEl}
                                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-300 light:text-blue-700">
                                  {documentCitationLabel(cell?.sourceUrl ?? null)}
                                </span>
                              </span>
                            ) : hasSource ? (
                              <a
                                href={cell!.sourceUrl!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 align-middle transition-opacity hover:opacity-80"
                              >
                                {scoreEl}
                                <span className="text-[10px] text-zinc-500">↗</span>
                              </a>
                            ) : (
                              scoreEl
                            )}
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
          <section className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-5">
            <h2 className="text-white font-semibold mb-4">Shape of strengths</h2>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={colorScheme === "light" ? "#e4e4e7" : "#27272a"} />
                <PolarAngleAxis dataKey="criterion" tick={{ fill: colorScheme === "light" ? "#52525b" : "#71717a", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: colorScheme === "light" ? "#ffffff" : "#18181b", border: `1px solid ${colorScheme === "light" ? "#e4e4e7" : "#27272a"}`, borderRadius: 8 }}
                  labelStyle={{ color: colorScheme === "light" ? "#09090b" : "#fafafa" }}
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
            <p className="text-zinc-300 light:text-zinc-700 leading-relaxed whitespace-pre-line">{verdict}</p>
          </section>
        </motion.div>

        {/* What would change + Assumptions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3 * 0.08, duration: 0.45, ease: "easeOut" }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* What would change this recommendation */}
            <section className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-6">
              <h2 className="text-white font-semibold mb-1">What would change this recommendation</h2>
              <p className="text-zinc-500 text-xs mb-4">The conditions that would shift the pick</p>
              <ul className="space-y-3">
                {whatWouldChange.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-6 text-zinc-300 light:text-zinc-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {safestChoiceText && (
                <p className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/5 px-3 py-2 text-xs leading-5 text-blue-300 light:text-blue-700">
                  {safestChoiceText}
                </p>
              )}
            </section>

            {/* Assumptions */}
            <section className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-6">
              <h2 className="text-white font-semibold mb-1">Assumptions</h2>
              <p className="text-zinc-500 text-xs mb-4">What this recommendation rests on</p>

              <dl className="space-y-3 text-sm">
                {priorities.length > 0 && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-zinc-500">You prioritise</dt>
                    <dd className="text-zinc-300 light:text-zinc-700">{priorities.join(", ")}</dd>
                  </div>
                )}
                {mustHaves.length > 0 && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-zinc-500">Must-haves</dt>
                    <dd className="text-zinc-300 light:text-zinc-700">{mustHaves.join(", ")}</dd>
                  </div>
                )}
                {DEMO_PROFILE.budget_ceiling != null && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-zinc-500">Budget ceiling</dt>
                    <dd className="text-zinc-300 light:text-zinc-700">${DEMO_PROFILE.budget_ceiling.toLocaleString()}</dd>
                  </div>
                )}
                {DEMO_PROFILE.compliance_reqs.length > 0 && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-zinc-500">Compliance</dt>
                    <dd className="text-zinc-300 light:text-zinc-700">{DEMO_PROFILE.compliance_reqs.join(", ")}</dd>
                  </div>
                )}
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-zinc-500">Company</dt>
                  <dd className="text-zinc-300">{DEMO_PROFILE.name}</dd>
                </div>
              </dl>

              {dataCaveats.length > 0 && (
                <div className="mt-4 border-t border-zinc-800 pt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Data caveats</p>
                  <ul className="space-y-1.5">
                    {dataCaveats.map((caveat, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-5 text-zinc-400 light:text-zinc-600">
                        <span className="text-yellow-400">⚠</span>
                        <span>{caveat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        </motion.div>

        {/* Chat */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 4 * 0.08, duration: 0.45, ease: "easeOut" }}
        >
          <section className="no-print rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 light:border-zinc-200">
              <h2 className="text-white light:text-zinc-900 font-semibold">Refine</h2>
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
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-zinc-800 light:bg-zinc-100 text-zinc-200 light:text-zinc-700 rounded-bl-sm"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}

            <div className="px-4 py-3 border-t border-zinc-800 light:border-zinc-200 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="What if security mattered more?"
                disabled={chatLoading}
                className="flex-1 bg-zinc-800 light:bg-zinc-50 text-white light:text-zinc-900 placeholder-zinc-500 rounded-xl px-4 py-2 text-sm outline-none border border-zinc-700 light:border-zinc-200 focus:border-zinc-500 light:focus:border-zinc-400 transition-colors"
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim() || chatLoading}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm transition-colors"
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
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Export result as PDF
          </button>
        </div>
        <CostSimulationPanel
          products={tcoProducts}
          seats={tcoSeats}
          growthRatePct={tcoGrowthRate}
          years={tcoYears}
          selectedTiers={tcoSelectedTiers}
          onSeatsChange={setTcoSeats}
          onGrowthRateChange={setTcoGrowthRate}
          onYearsChange={setTcoYears}
          onTierChange={(productId, tierName) =>
            setTcoSelectedTiers((prev) => {
              const next = { ...prev };
              if (tierName) next[productId] = tierName;
              else delete next[productId];
              return next;
            })
          }
          colorScheme={colorScheme}
        />
      </div>
      </main>
      <div className="memo-print-root">
        {printMemo && <DecisionMemo memo={printMemo} />}
      </div>
    </>
  );
}

function CostSimulationPanel({
  products,
  seats,
  growthRatePct,
  years,
  selectedTiers,
  onSeatsChange,
  onGrowthRateChange,
  onYearsChange,
  onTierChange,
  colorScheme
}: {
  products: TcoProduct[];
  seats: number;
  growthRatePct: number;
  years: number;
  selectedTiers: Record<string, string>;
  onSeatsChange: (value: number) => void;
  onGrowthRateChange: (value: number) => void;
  onYearsChange: (value: number) => void;
  onTierChange: (productId: string, tierName: string) => void;
  colorScheme: "dark" | "light";
}) {
  const [debouncedUsage, setDebouncedUsage] = useState({
    seats,
    growthRatePct,
    years,
    selectedTiers
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedUsage({ seats, growthRatePct, years, selectedTiers });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [seats, growthRatePct, years, selectedTiers]);

  const pricedProducts = products.filter((product) => product.pricing_model);
  const projection = computeTco(pricedProducts, {
    seats: debouncedUsage.seats,
    growthRatePct: debouncedUsage.growthRatePct,
    years: debouncedUsage.years,
    selectedTierByProduct: debouncedUsage.selectedTiers
  });
  const projectedYears = debouncedUsage.years;
  const availableProducts = projection.products.filter((product) => product.available);
  const unavailableProducts = projection.products.filter((product) => !product.available);

  if (products.length === 0 || pricedProducts.length === 0 || availableProducts.length === 0) {
    return (
      <section className="no-print rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-6">
        <h2 className="text-white light:text-zinc-900 font-semibold">Cost Simulation</h2>
        <p className="mt-2 text-sm text-zinc-400 light:text-zinc-600">
          Cost simulation unavailable — no public pricing found.
        </p>
      </section>
    );
  }

  const chartData = Array.from({ length: projectedYears }, (_, index) => {
    const year = index + 1;
    const row: Record<string, number | string> = { year: `Year ${year}` };
    for (const product of availableProducts) {
      row[product.productId] = product.perYear[index]?.cumulativeCost ?? 0;
    }
    return row;
  });
  const cheapestTotal = projection.ranking[0]?.totalCost ?? null;
  const mostExpensiveTotal = projection.ranking.at(-1)?.totalCost ?? null;
  const productName = (productId: string | null) =>
    products.find((product) => product.id === productId)?.name ?? productId ?? "Unavailable";
  const primaryCurrency = availableProducts[0]?.currency ?? "USD";
  const sourceProducts = products.filter((product) => pricingSource(product));

  return (
    <section className="no-print rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-6">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-white light:text-zinc-900 font-semibold">Cost Simulation</h2>
          <p className="mt-1 text-sm text-zinc-500 light:text-zinc-600">
            Project total cost from extracted pricing models. No LLM or network calls.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-zinc-700 light:border-zinc-200 px-3 py-1 text-xs text-zinc-400 light:text-zinc-600">
          Currency: {primaryCurrency}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50 p-4">
            <div className="space-y-4">
              <label className="block">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-200 light:text-zinc-800">Seats</span>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={seats}
                    onChange={(event) => onSeatsChange(Math.max(1, Number(event.target.value) || 1))}
                    className="w-20 rounded-lg border border-zinc-700 light:border-zinc-200 bg-zinc-900 light:bg-white px-2 py-1 text-right text-sm text-white light:text-zinc-900 outline-none"
                  />
                </div>
                <input
                  type="range"
                  min={1}
                  max={500}
                  value={seats}
                  onChange={(event) => onSeatsChange(Number(event.target.value))}
                  className="w-full accent-blue-500"
                />
              </label>

              <label className="block">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-200 light:text-zinc-800">Growth rate</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={growthRatePct}
                    onChange={(event) => onGrowthRateChange(Math.max(0, Number(event.target.value) || 0))}
                    className="w-20 rounded-lg border border-zinc-700 light:border-zinc-200 bg-zinc-900 light:bg-white px-2 py-1 text-right text-sm text-white light:text-zinc-900 outline-none"
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={growthRatePct}
                  onChange={(event) => onGrowthRateChange(Number(event.target.value))}
                  className="w-full accent-blue-500"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block font-medium text-zinc-200 light:text-zinc-800">Horizon</span>
                <select
                  value={years}
                  onChange={(event) => onYearsChange(Number(event.target.value))}
                  className="w-full rounded-xl border border-zinc-700 light:border-zinc-200 bg-zinc-900 light:bg-white px-3 py-2 text-sm text-white light:text-zinc-900 outline-none"
                >
                  {[1, 2, 3, 4, 5].map((year) => (
                    <option key={year} value={year}>
                      {year} {year === 1 ? "year" : "years"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white light:text-zinc-900">Vendor tiers</h3>
            <div className="space-y-3">
              {pricedProducts.map((product) => {
                const model = product.pricing_model;
                const projected = projection.products.find((item) => item.productId === product.id);
                const tiers = model?.tiers ?? [];
                const defaultTier = displayTierUsed(product, projected?.tierUsed ?? null);

                return (
                  <label key={product.id} className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400 light:text-zinc-600">
                      {product.name}
                    </span>
                    {tiers.length > 0 ? (
                      <select
                        value={selectedTiers[product.id] ?? ""}
                        onChange={(event) => onTierChange(product.id, event.target.value)}
                        className="w-full rounded-xl border border-zinc-700 light:border-zinc-200 bg-zinc-950 light:bg-white px-3 py-2 text-sm text-white light:text-zinc-900 outline-none"
                      >
                        <option value="">Default ({defaultTier})</option>
                        {tiers.map((tier) => (
                          <option key={tier.tier_name ?? `${tier.unit_price}-${tier.flat_price}`} value={tier.tier_name ?? ""}>
                            {(tier.tier_name ?? "Unnamed tier")} – {formatTierPrice(tier, model!)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="rounded-xl border border-zinc-800 light:border-zinc-200 bg-zinc-950 light:bg-zinc-50 px-3 py-2 text-sm text-zinc-400">
                        {model?.per_unit_price != null
                          ? `${formatMoney(model.per_unit_price, model.currency)}/${model.unit ?? "unit"}/${model.period ?? "period"}`
                          : "No tier list available"}
                      </p>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50 p-4">
            <div className="mb-3 rounded-xl border border-blue-500/15 bg-blue-500/5 px-4 py-3 text-sm text-blue-200 light:text-blue-700">
              Cheapest today: <span className="font-semibold">{productName(projection.insight.cheapestNow)}</span>.
              {" "}Cheapest over {projectedYears} {projectedYears === 1 ? "year" : "years"}:{" "}
              <span className="font-semibold">{productName(projection.insight.cheapestOverHorizon)}</span>.
              <div className="mt-1 text-xs text-blue-200/75 light:text-blue-700/80">
                {projection.insight.crossovers.length > 0
                  ? projection.insight.crossovers.map((crossover) =>
                      `${productName(crossover.productA)} overtakes ${productName(crossover.productB)} in year ${crossover.year}.`
                    ).join(" ")
                  : "No crossover at these tiers — costs scale proportionally."}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={colorScheme === "light" ? "#e4e4e7" : "#27272a"} strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fill: colorScheme === "light" ? "#52525b" : "#a1a1aa", fontSize: 12 }} />
                <YAxis
                  tick={{ fill: colorScheme === "light" ? "#52525b" : "#a1a1aa", fontSize: 12 }}
                  tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatMoney(Number(value), primaryCurrency),
                    products.find((product) => product.id === name)?.name ?? name
                  ]}
                  contentStyle={{
                    background: colorScheme === "light" ? "#ffffff" : "#18181b",
                    border: `1px solid ${colorScheme === "light" ? "#e4e4e7" : "#27272a"}`,
                    borderRadius: 8
                  }}
                  labelStyle={{ color: colorScheme === "light" ? "#09090b" : "#fafafa" }}
                />
                {availableProducts.map((product, index) => (
                  <Line
                    key={product.productId}
                    type="monotone"
                    dataKey={product.productId}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {projection.products.map((product, index) => {
              const source = pricingSource(products.find((item) => item.id === product.productId)!);
              const isCheapest = cheapestTotal !== null && product.totalCost === cheapestTotal;
              const isMostExpensive = mostExpensiveTotal !== null && product.totalCost === mostExpensiveTotal && projection.ranking.length > 1;

              return (
                <div
                  key={product.productId}
                  className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50 p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
                    <h3 className="text-sm font-semibold text-white light:text-zinc-900">{productName(product.productId)}</h3>
                  </div>
                  {product.available ? (
                    <>
                      <p className="text-xs text-zinc-500">Tier</p>
                      <p className="mb-3 text-sm text-zinc-200 light:text-zinc-700">
                        {displayTierUsed(products.find((item) => item.id === product.productId)!, product.tierUsed)}
                      </p>
                      <p className="text-xs text-zinc-500">Total over {projectedYears} years</p>
                      <p className="text-xl font-bold text-white light:text-zinc-900">
                        {formatMoney(product.totalCost ?? 0, product.currency)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {isCheapest && (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] text-green-300 light:text-green-700">
                            Cheapest
                          </span>
                        )}
                        {isMostExpensive && (
                          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-300 light:text-yellow-700">
                            Most expensive
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-yellow-200 light:text-yellow-700">
                      Pricing not publicly determinable — excluded from projection. {product.notes}
                    </p>
                  )}
                  {source && (
                    <a
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex text-xs text-blue-300 underline decoration-dotted underline-offset-2 light:text-blue-700"
                    >
                      Pricing source ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {projection.insight.notes.length > 0 && (
            <div className="space-y-1">
              {projection.insight.notes.map((note) => (
                <p key={note} className="text-xs text-zinc-500 light:text-zinc-600">
                  {note}
                </p>
              ))}
            </div>
          )}

          {unavailableProducts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unavailableProducts.map((product) => (
                <span
                  key={product.productId}
                  title={product.notes ?? undefined}
                  className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-200 light:text-yellow-700"
                >
                  {productName(product.productId)} pricing unavailable
                </span>
              ))}
            </div>
          )}

          {sourceProducts.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              {sourceProducts.map((product) => (
                <a
                  key={product.id}
                  href={pricingSource(product) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted underline-offset-2 hover:text-zinc-300 light:hover:text-zinc-700"
                >
                  {product.name} pricing source
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
