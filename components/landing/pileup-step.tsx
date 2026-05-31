"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ContainerScroll } from "@/components/ui/container-scroll";

type PileupStepProps = {
  nextHref?: string;
  skipHref?: string;
};

const problems = [
  "Vendor marketing claims",
  "Contradictory reviews",
  "Scattered specs",
  "Shifting criteria",
  "Unstated assumptions",
  "No way to justify it later"
];

const stackStyles = [
  "rotate-[-5deg] translate-x-[-10px]",
  "rotate-[3deg] translate-x-[16px] -mt-3",
  "rotate-[-2deg] translate-x-[-4px] -mt-3",
  "rotate-[4deg] translate-x-[10px] -mt-3",
  "rotate-[-4deg] translate-x-[-14px] -mt-3",
  "rotate-[2deg] translate-x-[2px] -mt-3"
];

export function PileupStep({ nextHref = "/", skipHref = "/" }: PileupStepProps) {
  const scrollRef = useRef<HTMLElement>(null);

  return (
    <main ref={scrollRef} className="fixed inset-0 z-40 overflow-y-auto overflow-x-hidden bg-[#050608] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_20%,rgba(34,197,94,0.13),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.06),transparent_24%),linear-gradient(to_bottom,#050608,#09090b)]"
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-end px-5 py-5 sm:px-8">
          <Link
            href={skipHref}
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-300 backdrop-blur transition-colors hover:border-white/25 hover:text-white"
          >
            Skip
          </Link>
        </header>

        <div className="flex flex-1 items-center pb-24 pt-2 min-h-[160vh]">
          <ContainerScroll
            scrollContainer={scrollRef}
            titleComponent={
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                <p className="mb-4 text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
                  The pileup
                </p>
                <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                  Every purchase drowns in the same mess
                </h1>
              </motion.div>
            }
          >
            <div className="grid h-full min-h-[328px] place-items-center sm:min-h-[382px]">
              <div className="relative w-full max-w-xl px-2 py-5 sm:px-0">
                <div
                  aria-hidden="true"
                  className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-400/10 blur-3xl"
                />
                {problems.map((problem, index) => (
                  <motion.div
                    key={problem}
                    initial={{ opacity: 0, y: 22, rotate: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06, duration: 0.35, ease: "easeOut" }}
                    className={`relative mx-auto flex min-h-14 max-w-lg items-center justify-between gap-5 rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-4 shadow-[0_18px_55px_rgba(0,0,0,0.38)] backdrop-blur ${stackStyles[index]}`}
                  >
                    <span className="text-sm font-medium text-zinc-100 sm:text-base">{problem}</span>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-green-300/80 shadow-[0_0_18px_rgba(134,239,172,0.6)]" />
                  </motion.div>
                ))}
              </div>
            </div>
          </ContainerScroll>
        </div>

        <footer className="sticky bottom-0 z-30 flex items-center justify-between gap-3 border-t border-white/5 bg-[#050608]/70 px-5 py-5 backdrop-blur sm:px-8">
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
