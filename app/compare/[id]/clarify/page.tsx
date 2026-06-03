"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { StartResponse } from "@/lib/api-types";
import type { ClarifyBody } from "@/lib/api-types";
import { parseSessionData, readSessionData, saveSessionData } from "@/lib/session-data";
import { upsertComparisonHistory } from "@/lib/comparison-history";
import OnboardCard from "@/components/ui/onboard-card";
import ProductLogo from "@/components/ui/product-logo";

type Answer = {
  questionId: string;
  question: string;
  answer: string;
  category: string;
};

export default function ClarifyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [data, setData] = useState<StartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [extraContext, setExtraContext] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("data");
    if (raw) {
      try {
        const parsed = parseSessionData<StartResponse>(raw);
        setData(parsed);
        saveSessionData(id, parsed);
      } catch {
        setError("Invalid session data.");
      }
      return;
    }

    const saved = readSessionData<StartResponse>(id);
    if (saved) {
      setData(saved);
    } else {
      setError("Invalid session data.");
    }
  }, [id, searchParams]);

  // Pre-fill answers marked from_profile only when an active profile exists.
  useEffect(() => {
    if (!data) return;
    if (!data.profile) {
      setAnswers({});
      return;
    }
    const prefilled: Record<string, string> = {};
    for (const q of data.questions) {
      const profileAnswer = q.suggested_answers.find((a) => a.from_profile);
      if (profileAnswer) prefilled[q.id] = profileAnswer.label;
    }
    setAnswers(prefilled);
  }, [data]);

  function selectAnswer(questionId: string, label: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: label }));
  }

  function goNext(totalSteps: number) {
    setStepIndex((current) => Math.min(current + 1, totalSteps - 1));
  }

  function goBack() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function submit() {
    if (!data) return;
    setLoading(true);
    setError(null);

    const answerList: Answer[] = [
      ...data.questions.map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: answers[q.id] ?? "",
        category: q.category
      })),
      ...(extraContext.trim()
        ? [
            {
              questionId: "extra_context",
              question: "Additional context",
              answer: extraContext.trim(),
              category: "clarification"
            }
          ]
        : [])
    ];

    const body: ClarifyBody = {
      products: data.products,
      criteria: data.criteria,
      profile: data.profile,
      answers: answerList
    };

    try {
      const res = await fetch(`/api/comparisons/${id}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      saveSessionData(id, result);
      const href = `/compare/${id}/results`;
      upsertComparisonHistory({
        id,
        title: data.products.map((product) => product.name).join(" vs "),
        href,
        status: "results"
      });
      router.push(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center text-zinc-400">
        {error ?? "Loading…"}
      </main>
    );
  }

  const groupedQuestions = [
    {
      title: "Priorities",
      subtitle: "These shape the scoring weights.",
      questions: data.questions.filter((q) => q.category === "priorities")
    },
    {
      title: "Must-haves",
      subtitle: "Only true dealbreakers should be selected here.",
      questions: data.questions.filter((q) => q.category === "dealbreakers")
    },
    {
      title: "Details",
      subtitle: "A few specifics so the recommendation fits the use case.",
      questions: data.questions.filter((q) => q.category === "clarification")
    }
  ].filter((group) => group.questions.length > 0);
  const questionSteps = groupedQuestions.flatMap((group) =>
    group.questions.map((question) => ({
      groupTitle: group.title,
      groupSubtitle: group.subtitle,
      question
    }))
  );
  const totalSteps = questionSteps.length + 1;
  const isExtraStep = stepIndex === questionSteps.length;
  const activeQuestion = questionSteps[stepIndex];
  const answeredCount = data.questions.filter((question) => answers[question.id]).length;
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <>
      {loading && <RunningOverlay products={data.products.map((p) => p.name)} />}
      <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="sticky top-0 z-10 -mx-4 mb-8 border-b border-zinc-900 light:border-zinc-200 bg-[#0b0f12]/95 light:bg-white/95 px-4 pb-5 pt-1 backdrop-blur">
          <p className="mb-2 text-sm text-zinc-500">Step 2 of 3</p>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white light:text-zinc-900">Tune the decision</h1>
              <p className="mt-1 text-sm text-zinc-500">Answer the questions below, then analyze.</p>
            </div>
            {data.profile && (
              <div className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300 light:text-blue-700">
                {data.profile.name.trim() ? `${data.profile.name} profile applied` : "Profile applied"}
              </div>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.products.map((product, index) => (
              <div
                key={`${product.name}-${index}`}
                className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-zinc-700 light:border-zinc-200 bg-zinc-900 light:bg-zinc-50 pl-1.5 pr-3 text-sm text-zinc-200 light:text-zinc-700"
              >
                <ProductLogo name={product.name} size={28} />
                <span className="max-w-36 truncate">{product.name}</span>
              </div>
            ))}
          </div>
        </div>

        <section>
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-4 text-xs text-zinc-500">
              <span>
                Question {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
              </span>
              <span>{answeredCount} selected</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800 light:bg-zinc-200">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {isExtraStep ? (
              <motion.div
                key="extra-context"
                initial={{ opacity: 0, x: 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -32 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <label htmlFor="extra-context" className="block text-xl font-semibold text-white light:text-zinc-900">
                  Anything else?
                </label>
                <p className="mt-2 text-sm text-zinc-500">
                  Add one extra sentence if there is a nuance the choices did not capture.
                </p>
                <textarea
                  id="extra-context"
                  value={extraContext}
                  onChange={(event) => setExtraContext(event.target.value)}
                  rows={4}
                  placeholder="e.g. We need something non-technical managers can maintain."
                  className="mt-5 w-full resize-none rounded-2xl border border-zinc-700 light:border-zinc-200 bg-zinc-950 light:bg-zinc-50 px-4 py-3 text-sm text-white light:text-zinc-900 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-500 light:focus:border-zinc-400"
                />
              </motion.div>
            ) : activeQuestion ? (
              <motion.div
                key={activeQuestion.question.id}
                initial={{ opacity: 0, x: 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -32 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <div className="mb-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-400 light:text-blue-700">
                    {activeQuestion.groupTitle}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">{activeQuestion.groupSubtitle}</p>
                </div>
                <QuestionCard
                  q={activeQuestion.question}
                  selected={answers[activeQuestion.question.id]}
                  onSelect={selectAnswer}
                  products={data.products.map((p) => p.name)}
                  hasProfile={Boolean(data.profile)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {error && <p className="mt-6 text-red-400 text-sm">{error}</p>}

        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={stepIndex === 0 ? () => router.back() : goBack}
            className="text-zinc-500 hover:text-zinc-300 light:hover:text-zinc-700 text-sm transition-colors"
          >
            {stepIndex === 0 ? "← Back" : "← Previous"}
          </button>
          {isExtraStep ? (
            <button
              onClick={submit}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing…
                </span>
              ) : (
                "Analyze →"
              )}
            </button>
          ) : (
            <button
              onClick={() => goNext(totalSteps)}
              disabled={!activeQuestion || (activeQuestion.question.input_type !== "per_product" && !answers[activeQuestion.question.id])}
              className="rounded-xl bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          )}
        </div>

        {loading && (
          <p className="mt-4 text-zinc-500 text-xs text-center">
            Searching the web and extracting evidence for each product. This takes ~20s.
          </p>
        )}
      </div>
      </main>
    </>
  );
}

function RunningOverlay({ products }: { products: string[] }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0f12]/95 px-4 backdrop-blur-sm">
      <h2 className="mb-1 text-xl font-bold text-white">Running the comparison</h2>
      <p className="mb-8 max-w-sm text-center text-sm text-zinc-400">
        Gathering live evidence for{" "}
        <span className="text-zinc-200">{products.join(" vs ")}</span> and scoring it.
      </p>
      <OnboardCard />
    </div>
  );
}

function QuestionCard({
  q,
  selected,
  onSelect,
  products,
  hasProfile
}: {
  q: StartResponse["questions"][number];
  selected: string | undefined;
  onSelect: (id: string, label: string) => void;
  products: string[];
  hasProfile: boolean;
}) {
  const isPerProduct = q.input_type === "per_product";
  const targetProductsRaw =
    isPerProduct && q.target_products && q.target_products.length > 0
      ? q.target_products.filter((name) => products.includes(name))
      : products;
  const targetProducts = targetProductsRaw.length > 0 ? targetProductsRaw : products;

  // The answer is "custom" when it doesn't match any suggested chip.
  const isCustom =
    !isPerProduct &&
    selected !== undefined &&
    selected.length > 0 &&
    !q.suggested_answers.some((a) => a.label === selected);

  function getPerProductValues(): Record<string, string> {
    try {
      return selected ? JSON.parse(selected) : {};
    } catch {
      return {};
    }
  }

  function handlePerProductChange(productName: string, value: string) {
    const current = getPerProductValues();
    const updated = { ...current, [productName]: value };
    onSelect(q.id, JSON.stringify(updated));
  }

  return (
    <div className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900/50 light:bg-white p-5 sm:p-6">
      <p className="mb-5 text-base font-medium leading-7 text-zinc-100 light:text-zinc-800">{q.question}</p>
      {isPerProduct ? (
        <div className="flex flex-col gap-3">
          {targetProducts.map((productName) => {
            const value = getPerProductValues()[productName] ?? "";
            return (
              <div key={productName} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-zinc-400 light:text-zinc-500">{productName}</span>
                <input
                  type="text"
                  value={value}
                  onChange={(event) => handlePerProductChange(productName, event.target.value)}
                  placeholder="e.g. $75/user/mo"
                  className="flex-1 rounded-xl border border-zinc-700 light:border-zinc-200 bg-zinc-900 light:bg-zinc-50 px-3 py-2.5 text-sm text-white light:text-zinc-900 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-500 light:focus:border-zinc-400"
                />
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {q.suggested_answers.map((a) => {
              const isSelected = selected === a.label;
              return (
                <button
                  key={a.label}
                  onClick={() => onSelect(q.id, a.label)}
                  className={`flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-500/15 text-white light:text-blue-900"
                      : "border-zinc-700 light:border-zinc-200 bg-zinc-900 light:bg-zinc-50 text-zinc-400 light:text-zinc-600 hover:border-zinc-500 light:hover:border-zinc-400 hover:text-zinc-200 light:hover:text-zinc-800"
                  }`}
                >
                  <span>{a.label}</span>
                  <span className={`ml-3 h-4 w-4 rounded-full border ${isSelected ? "border-blue-400 bg-blue-400" : "border-zinc-600 light:border-zinc-300"}`} />
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <input
              type="text"
              value={isCustom ? selected : ""}
              onChange={(event) => onSelect(q.id, event.target.value)}
              placeholder="Other..."
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-white light:text-zinc-900 outline-none transition-colors placeholder:text-zinc-600 ${
                isCustom
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-zinc-700 light:border-zinc-200 bg-zinc-900 light:bg-zinc-50 focus:border-zinc-500 light:focus:border-zinc-400"
              }`}
            />
          </div>

          {hasProfile && q.suggested_answers.some((answer) => answer.from_profile) && (
            <p className="mt-3 text-xs text-blue-400">Profile suggested option included.</p>
          )}
        </>
      )}
    </div>
  );
}
