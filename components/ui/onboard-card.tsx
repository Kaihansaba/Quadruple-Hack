"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

// Default phrases for Verdict's clarify -> results pipeline
// (Call 2 web extraction -> deterministic engine -> Call 3 narration).
const DEFAULT_STEPS = [
  "Searching the live web",
  "Reading expert & user reviews",
  "Reconciling conflicting sources",
  "Weighing what matters to you",
  "Scoring every option",
  "Checking your dealbreakers",
  "Writing your verdict",
];

// Card stride (height + gap) used to translate the column as steps advance.
const CARD_HEIGHT = 56;
const GAP = 8;
const STRIDE = CARD_HEIGHT + GAP;

type StepState = "done" | "active" | "pending";

interface OnboardCardProps {
  /** Phrases to step through, top to bottom. */
  steps?: string[];
  /** Milliseconds the active step spends loading before advancing. */
  stepDuration?: number;
  /** Fired once the final step is reached (the loader then holds, spinning). */
  onComplete?: () => void;
  className?: string;
}

const OnboardCard = ({
  steps = DEFAULT_STEPS,
  stepDuration = 1400,
  onComplete,
  className,
}: OnboardCardProps) => {
  const [current, setCurrent] = useState(0);
  const lastIndex = steps.length - 1;

  useEffect(() => {
    if (current >= lastIndex) {
      onComplete?.();
      return; // hold on the final step, spinner running, until the parent navigates away
    }
    const timer = setTimeout(() => setCurrent((c) => c + 1), stepDuration);
    return () => clearTimeout(timer);
  }, [current, lastIndex, stepDuration, onComplete]);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ height: STRIDE * 3 }}
    >
      <motion.div
        className="flex flex-col items-stretch"
        style={{ gap: GAP }}
        // Keep the active card in the middle of the three visible slots.
        animate={{ y: (1 - current) * STRIDE }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
      >
        {steps.map((label, i) => {
          const state: StepState =
            i < current ? "done" : i === current ? "active" : "pending";
          return (
            <div
              key={label}
              style={{ height: CARD_HEIGHT }}
              className={cn(
                "flex min-w-[260px] flex-col justify-center gap-2 rounded-md border px-3",
                "border-zinc-800 bg-gradient-to-br from-zinc-800 to-zinc-950 transition-all duration-500",
                state === "pending" && "scale-[0.92] opacity-50",
                state === "done" && "opacity-80"
              )}
            >
              <div className="flex items-center gap-2 text-xs">
                <StepIcon state={state} />
                <span
                  className={cn(
                    state === "active" && "text-zinc-100",
                    state === "done" && "text-zinc-300",
                    state === "pending" && "text-zinc-500"
                  )}
                >
                  {label}
                </span>
              </div>
              <div className="ml-5 h-1.5 overflow-hidden rounded-full bg-zinc-700">
                {state === "done" && <div className="h-full w-full bg-green-500" />}
                {state === "active" && (
                  <motion.div
                    key={current}
                    className="h-full bg-green-500"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: stepDuration / 1000, ease: "easeInOut" }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Fade the column into the page background at top and bottom. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#0d0d0f] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0d0d0f] to-transparent" />
    </div>
  );
};

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-green-500">
        <svg
          viewBox="0 0 12 12"
          className="size-2.5 text-black"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5 5 9l4.5-5" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "size-3.5 shrink-0 rounded-full border-2",
        state === "active"
          ? "animate-spin border-green-400/30 border-t-green-400"
          : "border-zinc-700"
      )}
    />
  );
}

export default OnboardCard;
