"use client";

import Link from "next/link";
import { motion } from "framer-motion";

type GetStartedStepProps = {
  getStartedHref?: string;
  skipHref?: string;
};

export function GetStartedStep({ getStartedHref = "/", skipHref = "/" }: GetStartedStepProps) {
  return (
    <main className="fixed inset-0 z-40 overflow-hidden bg-[#050608] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,197,94,0.16),transparent_28%),radial-gradient(circle_at_50%_58%,rgba(255,255,255,0.08),transparent_32%),linear-gradient(to_bottom,#050608,#09090b)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
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
          <div className="mx-auto max-w-6xl text-center">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="mb-5 text-sm font-semibold uppercase tracking-[0.34em] text-green-300/80"
            >
              Introducing
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.45, ease: "easeOut" }}
              className="text-[clamp(5rem,18vw,13rem)] font-black leading-[0.78] tracking-tight text-white drop-shadow-[0_28px_80px_rgba(255,255,255,0.13)]"
            >
              Verdict
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, duration: 0.42, ease: "easeOut" }}
              className="mx-auto mt-10 max-w-4xl text-balance text-2xl font-medium leading-9 text-zinc-200 sm:text-3xl sm:leading-10"
            >
              In B2B, nobody gets fired for the comparison; they get fired for a bad purchase they
              can't justify.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.68, duration: 0.36, ease: "easeOut" }}
              className="mt-11 flex justify-center"
            >
              <Link
                href={getStartedHref}
                className="rounded-2xl bg-white px-8 py-4 text-base font-semibold text-zinc-950 shadow-[0_0_36px_rgba(255,255,255,0.16)] transition-colors hover:bg-zinc-200"
              >
                Get Started
              </Link>
            </motion.div>
          </div>
        </section>
      </div>
    </main>
  );
}
