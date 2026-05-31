"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { StartResponse } from "@/lib/api-types";
import type { ClarifyBody } from "@/lib/api-types";
import { parseSessionData, saveSessionData } from "@/lib/session-data";
import { upsertComparisonHistory } from "@/lib/comparison-history";

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
        setData(parseSessionData<StartResponse>(raw));
      } catch {
        setError("Invalid session data.");
      }
    }
  }, [searchParams]);

  // Pre-fill answers marked from_profile
  useEffect(() => {
    if (!data) return;
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

    const body: ClarifyBody & {
      products: StartResponse["products"];
      criteria: StartResponse["criteria"];
    } = {
      products: data.products,
      criteria: data.criteria,
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
    group.questions.map((question, index) => ({
      groupTitle: group.title,
      groupSubtitle: group.subtitle,
      number: index + 1,
      question
    }))
  );
  const totalSteps = questionSteps.length + 1;
  const isExtraStep = stepIndex === questionSteps.length;
  const activeQuestion = questionSteps[stepIndex];
  const answeredCount = data.questions.filter((question) => answers[question.id]).length;
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="sticky top-0 z-10 -mx-4 mb-8 border-b border-zinc-900 bg-[#0d0d0f]/95 px-4 pb-5 pt-1 backdrop-blur">
          <p className="mb-2 text-sm text-zinc-500">Step 2 of 3</p>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Tune the decision</h1>
              <p className="mt-1 text-sm text-zinc-500">Answer the questions below, then analyze.</p>
            </div>
            <div className="rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-xs text-green-300">
              Meridian Software profile applied
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.products.map((product, index) => (
              <div
                key={`${product.name}-${index}`}
                className="flex h-10 shrink-0 items-center rounded-full border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200"
              >
                <span className="mr-2 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400">
                  {index + 1}
                </span>
                <span className="max-w-36 truncate">{product.name}</span>
              </div>
            ))}
          </div>
        </div>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-4 text-xs text-zinc-500">
              <span>
                Question {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
              </span>
              <span>{answeredCount} selected</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300"
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
                <label htmlFor="extra-context" className="block text-xl font-semibold text-white">
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
                  className="mt-5 w-full resize-none rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-500"
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
                  <p className="text-xs font-medium uppercase tracking-wide text-green-400">
                    {activeQuestion.groupTitle}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">{activeQuestion.groupSubtitle}</p>
                </div>
                <QuestionCard
                  number={activeQuestion.number}
                  q={activeQuestion.question}
                  selected={answers[activeQuestion.question.id]}
                  onSelect={selectAnswer}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {error && <p className="mt-6 text-red-400 text-sm">{error}</p>}

        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={stepIndex === 0 ? () => router.back() : goBack}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            {stepIndex === 0 ? "← Back" : "← Previous"}
          </button>
          {isExtraStep ? (
            <button
              onClick={submit}
              disabled={loading}
              className="rounded-xl bg-green-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-40"
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
              disabled={!activeQuestion || !answers[activeQuestion.question.id]}
              className="rounded-xl bg-green-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
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
  );
}

function QuestionCard({
  number,
  q,
  selected,
  onSelect
}: {
  number: number;
  q: StartResponse["questions"][number];
  selected: string | undefined;
  onSelect: (id: string, label: string) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-3 flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-400">
          {number}
        </span>
        <p className="text-sm font-medium leading-6 text-zinc-200">{q.question}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {q.suggested_answers.map((a) => {
          const isSelected = selected === a.label;
          return (
            <button
              key={a.label}
              onClick={() => onSelect(q.id, a.label)}
              className={`flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-all ${
                isSelected
                  ? "border-green-500 bg-green-500/15 text-white"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              <span>{a.label}</span>
              <span className={`ml-3 h-4 w-4 rounded-full border ${isSelected ? "border-green-400 bg-green-400" : "border-zinc-600"}`} />
            </button>
          );
        })}
      </div>
      {q.suggested_answers.some((answer) => answer.from_profile) && (
        <p className="mt-3 text-xs text-green-400">Profile suggested option included.</p>
      )}
    </div>
  );
}
