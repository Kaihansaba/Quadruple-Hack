"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShaderAnimation } from "@/components/ui/shader-animation";

const HOME_HREF = "/home";
const AUTO_ADVANCE_MS = 3500;

type IntermediateStepProps = {
  quote?: string;
};

export function IntermediateStep({
  quote = "The hard part was never the comparison. It was being able to defend the choice."
}: IntermediateStepProps) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasNavigatedRef = useRef(false);

  const goHome = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    router.push(HOME_HREF);
  }, [router]);

  useEffect(() => {
    timerRef.current = setTimeout(goHome, AUTO_ADVANCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [goHome]);

  return (
    <main
      className="fixed inset-0 z-40 cursor-pointer overflow-hidden bg-[#050608] text-white"
      onClick={goHome}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          goHome();
        }
      }}
      aria-label="Continue to Verdict"
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <ShaderAnimation />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_34%),linear-gradient(to_bottom,rgba(5,6,8,0.1),rgba(5,6,8,0.72))]"
      />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          goHome();
        }}
        className="absolute right-5 top-5 z-20 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-300 backdrop-blur transition-colors hover:border-white/25 hover:text-white sm:right-8 sm:top-8"
      >
        Skip
      </button>

      <section className="relative z-10 grid min-h-screen place-items-center px-6">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: "easeOut" }}
          className="max-w-4xl text-balance text-center text-3xl font-bold leading-snug tracking-tight text-white sm:text-5xl lg:text-6xl"
          style={{ textShadow: "0 2px 24px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.9)" }}
        >
          {quote}
        </motion.p>
      </section>
    </main>
  );
}
