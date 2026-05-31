"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, animate } from "framer-motion";
import { cn } from "@/lib/utils";
import { SparklesCore } from "@/components/ui/sparkles-core";

type ProblemStepProps = {
  nextHref?: string;
  skipHref?: string;
};

const STATS = [
  {
    target: 86,
    suffix: "%",
    label: "of B2B purchases stall before a decision is reached",
    color: "from-white/10 to-white/[0.03]"
  },
  {
    target: 81,
    suffix: "%",
    label: "of buyers regret the choice they eventually made",
    color: "from-green-400/10 to-green-400/[0.02]"
  }
] as const;

export function ProblemStep({ nextHref = "/", skipHref = "/" }: ProblemStepProps) {
  const [counts, setCounts] = useState<number[]>(STATS.map(() => 0));

  useEffect(() => {
    const controls = STATS.map((stat, i) =>
      animate(0, stat.target, {
        duration: 1.6,
        delay: 0.55 + i * 0.18,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (v) =>
          setCounts((prev) => {
            const next = [...prev];
            next[i] = Math.round(v);
            return next;
          })
      })
    );
    return () => controls.forEach((c) => c.stop());
  }, []);

  return (
    <main className="fixed inset-0 z-40 overflow-hidden bg-[#050608] text-white">
      {/* particles layer */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <SparklesCore
          id="problem-step-particles"
          background="transparent"
          particleColor="#ffffff"
          particleDensity={70}
          minSize={0.6}
          maxSize={1.7}
          speed={1.6}
          className="h-full w-full"
        />
      </div>

      {/* vignette overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_42%),linear-gradient(to_bottom,rgba(5,6,8,0.15),rgba(5,6,8,0.88))]"
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-end px-5 py-5 sm:px-8">
          <Link
            href={skipHref}
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-300 backdrop-blur transition-colors hover:border-white/25 hover:text-white"
          >
            Skip
          </Link>
        </header>

        <section className="flex flex-1 items-center justify-center px-5 pb-20 pt-6 sm:px-8">
          <div className="mx-auto w-full max-w-5xl text-center">

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="mb-10 text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500"
            >
              The purchasing problem
            </motion.p>

            {/* stat cards */}
            <div className="mx-auto mb-12 grid max-w-3xl grid-cols-2 gap-4 sm:gap-6">
              {STATS.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 + i * 0.14, duration: 0.52, ease: "easeOut" }}
                  className={cn(
                    "rounded-3xl border border-white/[0.08] bg-gradient-to-b p-6 text-left backdrop-blur-sm sm:p-8",
                    stat.color
                  )}
                >
                  <div
                    className="text-[4rem] font-black leading-none tracking-tight text-white sm:text-[5.5rem]"
                    style={{ textShadow: "0 0 48px rgba(255,255,255,0.18)" }}
                  >
                    {counts[i]}
                    {stat.suffix}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-zinc-400 sm:text-base">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* kicker line */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.82, duration: 0.45, ease: "easeOut" }}
              className="mx-auto max-w-2xl text-balance text-lg leading-8 text-zinc-400 sm:text-xl"
            >
              Not because comparing is hard — because the decision is{" "}
              <span className="text-white">impossible to defend.</span>
            </motion.p>

          </div>
        </section>

        <footer className="relative z-20 flex items-center justify-between gap-3 px-5 pb-6 sm:px-8">
          <Link
            href={skipHref}
            className="rounded-xl px-4 py-3 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            Skip
          </Link>
          <Link
            href={nextHref}
            className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Next
          </Link>
        </footer>
      </div>
    </main>
  );
}
