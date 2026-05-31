"use client";

import { ReactNode, useRef, RefObject } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

type ContainerScrollProps = {
  titleComponent: ReactNode;
  children: ReactNode;
  className?: string;
  scrollContainer?: RefObject<HTMLElement | null>;
};

export function ContainerScroll({ titleComponent, children, className, scrollContainer }: ContainerScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    container: scrollContainer as RefObject<HTMLElement | null> | undefined,
    offset: ["start end", "end start"]
  });

  const rotateX = useTransform(scrollYProgress, [0, 0.45, 1], [12, 0, -4]);
  const scale = useTransform(scrollYProgress, [0, 0.45, 1], [0.94, 1, 0.98]);
  const translateY = useTransform(scrollYProgress, [0, 0.45, 1], [42, 0, -18]);

  return (
    <section
      ref={containerRef}
      className={cn("relative mx-auto flex w-full max-w-6xl flex-col items-center px-5 py-8 sm:px-8", className)}
    >
      <div className="mb-7 text-center">{titleComponent}</div>
      <div className="w-full [perspective:1000px]">
        <motion.div
          style={{ rotateX, scale, y: translateY }}
          className="relative mx-auto min-h-[360px] w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur sm:min-h-[430px] sm:p-6"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_42%),linear-gradient(to_bottom,rgba(39,39,42,0.58),rgba(9,9,11,0.94))]"
          />
          <div className="relative z-10 h-full">{children}</div>
        </motion.div>
      </div>
    </section>
  );
}
