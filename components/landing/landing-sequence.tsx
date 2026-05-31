"use client";

import { useRef, useState, useEffect, type RefObject } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue
} from "framer-motion";
import { cn } from "@/lib/utils";
import { SparklesCore } from "@/components/ui/sparkles-core";

// Spring config — overdamped so it's smooth with no bounce, but responsive
const SPRING = { stiffness: 180, damping: 32, mass: 1 };

// ── Scroll-driven integer counter ──────────────────────────────────────────
function AnimatedNumber({ value }: { value: MotionValue<number> }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const unsub = value.on("change", (v: number) => setN(Math.round(v)));
    return unsub;
  }, [value]);
  return <>{n}</>;
}

// ── Scroll hint ────────────────────────────────────────────────────────────
function ScrollHint({ opacity }: { opacity: MotionValue<number> }) {
  return (
    <motion.div
      style={{ opacity }}
      className="flex flex-col items-center gap-2 pb-10 text-zinc-600"
    >
      <span className="text-[10px] uppercase tracking-[0.22em]">Scroll</span>
      <motion.span
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
        className="text-base"
      >
        ↓
      </motion.span>
    </motion.div>
  );
}

// ── Auto-complete helper ───────────────────────────────────────────────────
// When the user scrolls past `threshold` in the section (going forward),
// smoothly finish the remaining scroll so all animations self-complete.
function useAutoComplete(
  rawProgress: MotionValue<number>,
  sectionRef: RefObject<HTMLDivElement | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  threshold = 0.48,
  targetProgress = 0.84
) {
  const hasCompletedRef = useRef(false);
  const prevRef = useRef(0);

  useEffect(() => {
    return rawProgress.on("change", (v) => {
      const forward = v > prevRef.current;
      prevRef.current = v;

      if (v < 0.04) hasCompletedRef.current = false; // reset at top

      if (forward && v > threshold && !hasCompletedRef.current) {
        hasCompletedRef.current = true;
        const container = containerRef.current;
        const section = sectionRef.current;
        if (!container || !section) return;
        const scrollable = section.offsetHeight - container.clientHeight;
        container.scrollTo({
          top: section.offsetTop + scrollable * targetProgress,
          behavior: "smooth"
        });
      }
    });
  }, [rawProgress, sectionRef, containerRef, threshold, targetProgress]);
}

// ── SECTION 1 — Problem ────────────────────────────────────────────────────
function ProblemSection({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress: raw } = useScroll({
    target: ref,
    container: scrollRef,
    offset: ["start start", "end end"]
  });

  // spring-smooth the raw scroll value — this is what drives all animations
  const s = useSpring(raw, SPRING);

  useAutoComplete(raw, ref, scrollRef);

  // stat cards
  const card1Opacity = useTransform(s, [0.07, 0.20], [0, 1]);
  const card1Y       = useTransform(s, [0.07, 0.20], [50, 0]);
  const card2Opacity = useTransform(s, [0.22, 0.35], [0, 1]);
  const card2Y       = useTransform(s, [0.22, 0.35], [50, 0]);

  // counters follow the spring, clamped to [0, target]
  const count1 = useTransform(s, [0.10, 0.52], [0, 86]);
  const count2 = useTransform(s, [0.26, 0.64], [0, 81]);

  // kicker
  const kickerOpacity = useTransform(s, [0.60, 0.74], [0, 1]);
  const kickerY       = useTransform(s, [0.60, 0.74], [14, 0]);

  // hint fades the moment you start scrolling
  const hintOpacity = useTransform(raw, [0, 0.05], [1, 0]);

  return (
    <div ref={ref} className="relative h-[190vh]">
      <div className="sticky top-0 h-screen overflow-hidden bg-[#050608]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <SparklesCore
            id="problem-particles"
            background="transparent"
            particleColor="#ffffff"
            particleDensity={70}
            minSize={0.6}
            maxSize={1.7}
            speed={1.6}
            className="h-full w-full"
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_42%),linear-gradient(to_bottom,rgba(5,6,8,0.1),rgba(5,6,8,0.88))]"
        />

        <div className="relative z-10 flex h-full flex-col">
          <div className="flex flex-1 items-center justify-center px-5 pt-6 sm:px-8">
            <div className="mx-auto w-full max-w-5xl text-center">
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="mb-10 text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500"
              >
                The purchasing problem
              </motion.p>

              <div className="mx-auto mb-12 grid max-w-3xl grid-cols-2 gap-4 sm:gap-6">
                <motion.div
                  style={{ opacity: card1Opacity, y: card1Y }}
                  className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/10 to-white/[0.03] p-6 text-left backdrop-blur-sm sm:p-8"
                >
                  <div
                    className="text-[4rem] font-black leading-none tracking-tight text-white sm:text-[5.5rem]"
                    style={{ textShadow: "0 0 48px rgba(255,255,255,0.18)" }}
                  >
                    <AnimatedNumber value={count1} />%
                  </div>
                  <p className="mt-4 text-sm leading-6 text-zinc-400 sm:text-base">
                    of B2B purchases stall before a decision is reached
                  </p>
                </motion.div>

                <motion.div
                  style={{ opacity: card2Opacity, y: card2Y }}
                  className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-green-400/10 to-green-400/[0.02] p-6 text-left backdrop-blur-sm sm:p-8"
                >
                  <div
                    className="text-[4rem] font-black leading-none tracking-tight text-white sm:text-[5.5rem]"
                    style={{ textShadow: "0 0 48px rgba(255,255,255,0.18)" }}
                  >
                    <AnimatedNumber value={count2} />%
                  </div>
                  <p className="mt-4 text-sm leading-6 text-zinc-400 sm:text-base">
                    of buyers regret the choice they eventually made
                  </p>
                </motion.div>
              </div>

              <motion.p
                style={{ opacity: kickerOpacity, y: kickerY }}
                className="mx-auto max-w-2xl text-balance text-lg leading-8 text-zinc-400 sm:text-xl"
              >
                Not because comparing is hard — because the decision is{" "}
                <span className="text-white">impossible to defend.</span>
              </motion.p>
            </div>
          </div>

          <ScrollHint opacity={hintOpacity} />
        </div>
      </div>
    </div>
  );
}

// ── SECTION 2 — Pileup ─────────────────────────────────────────────────────
const PROBLEMS = [
  "Vendor marketing claims",
  "Contradictory reviews",
  "Scattered specs",
  "Shifting criteria",
  "Unstated assumptions",
  "No way to justify it later"
] as const;

const STACK_STYLES = [
  "rotate-[-5deg] translate-x-[-10px]",
  "rotate-[3deg]  translate-x-[16px]",
  "rotate-[-2deg] translate-x-[-4px]",
  "rotate-[4deg]  translate-x-[10px]",
  "rotate-[-4deg] translate-x-[-14px]",
  "rotate-[2deg]  translate-x-[2px]"
] as const;

// Separate component so hooks are at the top level (no hooks-in-loops)
function PileupCard({
  problem,
  index,
  smooth
}: {
  problem: string;
  index: number;
  smooth: MotionValue<number>;
}) {
  const n     = PROBLEMS.length;
  const start = (index / n) * 0.74;
  const end   = start + 0.14;

  const opacity = useTransform(smooth, [start, end], [0, 1]);
  const y       = useTransform(smooth, [start, end], [30, 0]);

  return (
    <div className={cn("relative mx-auto max-w-lg", STACK_STYLES[index], index > 0 && "-mt-3")}>
      <motion.div
        style={{ opacity, y }}
        className="flex min-h-14 items-center justify-between gap-5 rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-4 shadow-[0_18px_55px_rgba(0,0,0,0.38)] backdrop-blur"
      >
        <span className="text-sm font-medium text-zinc-100 sm:text-base">{problem}</span>
        <span className="h-2 w-2 shrink-0 rounded-full bg-green-300/80 shadow-[0_0_18px_rgba(134,239,172,0.6)]" />
      </motion.div>
    </div>
  );
}

function PileupSection({
  scrollRef
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress: raw } = useScroll({
    target: ref,
    container: scrollRef,
    offset: ["start start", "end end"]
  });

  const smooth = useSpring(raw, SPRING);

  useAutoComplete(raw, ref, scrollRef, 0.46, 0.86);

  // headline fades in when section enters view
  const headlineOpacity = useTransform(smooth, [0, 0.10], [0, 1]);
  const headlineY       = useTransform(smooth, [0, 0.10], [18, 0]);

  return (
    <div ref={ref} className="relative h-[230vh]">
      <div className="sticky top-0 h-screen overflow-hidden bg-[#050608]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_20%,rgba(34,197,94,0.11),transparent_28%),linear-gradient(to_bottom,#050608,#09090b)]"
        />

        <div className="relative z-10 flex h-full flex-col items-center justify-center px-5 sm:px-8">
          <motion.div
            style={{ opacity: headlineOpacity, y: headlineY }}
            className="mb-10 text-center"
          >
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
              The pileup
            </p>
            <h2 className="mx-auto max-w-2xl text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Every purchase drowns in the same mess
            </h2>
          </motion.div>

          <div className="relative w-full max-w-xl">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-400/10 blur-3xl"
            />
            {PROBLEMS.map((problem, i) => (
              <PileupCard
                key={problem}
                problem={problem}
                index={i}
                smooth={smooth}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SECTION 3 — Get Started ────────────────────────────────────────────────
function GetStartedSection({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="relative h-screen overflow-hidden bg-[#050608]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,197,94,0.16),transparent_28%),radial-gradient(circle_at_50%_58%,rgba(255,255,255,0.08),transparent_32%),linear-gradient(to_bottom,#050608,#09090b)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-5 pb-20 pt-6 text-center sm:px-8">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4, root: scrollRef }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mb-5 text-sm font-semibold uppercase tracking-[0.34em] text-green-300/80"
        >
          Introducing
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4, root: scrollRef }}
          transition={{ delay: 0.14, duration: 0.5, ease: "easeOut" }}
          className="text-[clamp(5rem,18vw,13rem)] font-black leading-[0.78] tracking-tight text-white drop-shadow-[0_28px_80px_rgba(255,255,255,0.13)]"
        >
          Verdict
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4, root: scrollRef }}
          transition={{ delay: 0.38, duration: 0.45, ease: "easeOut" }}
          className="mx-auto mt-10 max-w-4xl text-balance text-2xl font-medium leading-9 text-zinc-200 sm:text-3xl sm:leading-10"
        >
          In B2B, nobody gets fired for the comparison; they get fired for a bad
          purchase they can't justify.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4, root: scrollRef }}
          transition={{ delay: 0.62, duration: 0.38, ease: "easeOut" }}
          className="mt-11"
        >
          <Link
            href="/landing/intermediate"
            className="rounded-2xl bg-white px-8 py-4 text-base font-semibold text-zinc-950 shadow-[0_0_36px_rgba(255,255,255,0.16)] transition-colors hover:bg-zinc-200"
          >
            Get Started
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

// ── Root export ────────────────────────────────────────────────────────────
export function LandingSequence() {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className="fixed inset-0 z-40 overflow-y-auto overflow-x-hidden bg-[#050608] text-white"
    >
      <Link
        href="/home"
        className="fixed right-5 top-5 z-50 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-300 backdrop-blur transition-colors hover:border-white/25 hover:text-white sm:right-8 sm:top-8"
      >
        Skip
      </Link>

      <ProblemSection scrollRef={scrollRef} />
      <PileupSection  scrollRef={scrollRef} />
      <GetStartedSection scrollRef={scrollRef} />
    </div>
  );
}
