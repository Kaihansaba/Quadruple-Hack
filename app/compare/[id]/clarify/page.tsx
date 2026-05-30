"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import type { StartResponse } from "@/lib/api-types";
import type { ClarifyBody } from "@/lib/api-types";
import { parseSessionData } from "@/lib/session-data";
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

  async function submit() {
    if (!data) return;
    setLoading(true);
    setError(null);

    const answerList: Answer[] = data.questions.map((q) => ({
      questionId: q.id,
      question: q.question,
      answer: answers[q.id] ?? "",
      category: q.category
    }));

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
      const href = `/compare/${id}/results?data=${encodeURIComponent(JSON.stringify(result))}`;
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

  const priorities = data.questions.filter((q) => q.category === "priorities");
  const dealbreakers = data.questions.filter((q) => q.category === "dealbreakers");
  const clarifications = data.questions.filter((q) => q.category === "clarification");

  const allAnswered = data.questions.every((q) => answers[q.id]);

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-zinc-500 text-sm mb-1">Step 2 of 3</p>
          <h1 className="text-2xl font-bold text-white mb-2">What matters most?</h1>
          <p className="text-zinc-400 text-sm">
            Comparing:{" "}
            <span className="text-white font-medium">
              {data.products.map((p) => p.name).join(" vs ")}
            </span>
          </p>
        </div>

        {/* Profile note */}
        <div className="mb-6 flex items-center gap-2 text-xs text-green-400 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <span className="text-green-400">✦</span>
          Answers marked with a dot are pre-selected from your company profile
        </div>

        <div className="space-y-8">
          {/* Priorities */}
          {priorities.length > 0 && (
            <Section title="Priorities" subtitle="What drives the weights">
              {priorities.map((q) => (
                <Question
                  key={q.id}
                  q={q}
                  selected={answers[q.id]}
                  onSelect={selectAnswer}
                />
              ))}
            </Section>
          )}

          {/* Dealbreakers */}
          {dealbreakers.length > 0 && (
            <Section title="Must-haves" subtitle="Hard requirements — failing these eliminates a vendor">
              {dealbreakers.map((q) => (
                <Question
                  key={q.id}
                  q={q}
                  selected={answers[q.id]}
                  onSelect={selectAnswer}
                />
              ))}
            </Section>
          )}

          {/* Clarifications */}
          {clarifications.length > 0 && (
            <Section title="Details" subtitle="Category-specific clarifications">
              {clarifications.map((q) => (
                <Question
                  key={q.id}
                  q={q}
                  selected={answers[q.id]}
                  onSelect={selectAnswer}
                />
              ))}
            </Section>
          )}
        </div>

        {error && <p className="mt-6 text-red-400 text-sm">{error}</p>}

        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </span>
            ) : (
              "Run comparison →"
            )}
          </button>
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

function Section({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-white font-semibold">{title}</h2>
        <p className="text-zinc-500 text-xs mt-0.5">{subtitle}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Question({
  q,
  selected,
  onSelect
}: {
  q: StartResponse["questions"][number];
  selected: string | undefined;
  onSelect: (id: string, label: string) => void;
}) {
  return (
    <div>
      <p className="text-zinc-300 text-sm mb-2">{q.question}</p>
      <div className="flex flex-wrap gap-2">
        {q.suggested_answers.map((a) => {
          const isSelected = selected === a.label;
          return (
            <button
              key={a.label}
              onClick={() => onSelect(q.id, a.label)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                isSelected
                  ? "bg-green-600 border-green-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {a.from_profile && (
                <span className="mr-1.5 text-green-400 text-xs">✦</span>
              )}
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
