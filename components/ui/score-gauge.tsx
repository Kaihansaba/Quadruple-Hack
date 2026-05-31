"use client";

import { useEffect, useId, useRef, useState } from "react";
import { animate } from "framer-motion";
import { useColorScheme } from "@/lib/use-color-scheme";

// Half-circle speedometer gauge. Fills left→right to `value` (0–100) with an
// animated arc, the colour reflecting how strong the score is, and the number
// counts up in the centre.
const ARC_PATH = "M 6 50 A 44 44 0 0 1 94 50"; // top semicircle, flat side at y=50

function gradientStops(value: number): [string, string] {
  if (value >= 80) return ["#93c5fd", "#2d71bf"]; // strong — rose
  if (value >= 40) return ["#fcd34d", "#f59e0b"]; // moderate — amber
  return ["#fca5a5", "#ef4444"]; // weak — red
}

export default function ScoreGauge({
  value,
  label = "Match",
  size = 160
}: {
  value: number;
  label?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const arcRef = useRef<SVGPathElement>(null);
  const [display, setDisplay] = useState(0);
  const gradId = useId();
  const [from, to] = gradientStops(clamped);
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Count the number up.
    const counter = animate(0, clamped, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v))
    });

    // Sweep the arc from empty to the value (pathLength is normalised to 100).
    const arc = arcRef.current;
    arc?.animate(
      [{ strokeDashoffset: 100 }, { strokeDashoffset: 100 - clamped }],
      { duration: 1400, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
    );

    return () => counter.stop();
  }, [clamped]);

  return (
    <div className="flex select-none flex-col items-center" style={{ width: size }}>
      <div className="relative w-full" style={{ height: size * 0.56 }}>
        <svg viewBox="0 0 100 56" className="block w-full" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={from} />
              <stop offset="100%" stopColor={to} />
            </linearGradient>
          </defs>
          {/* track */}
          <path
            d={ARC_PATH}
            fill="none"
            stroke={colorScheme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}
            strokeWidth={9}
            strokeLinecap="round"
          />
          {/* value arc */}
          <path
            ref={arcRef}
            d={ARC_PATH}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={9}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center">
          <span className="text-5xl font-bold leading-none tracking-tight text-white light:text-zinc-900">{display}</span>
        </div>
      </div>
      <span className="mt-1 text-xs uppercase tracking-wide text-blue-300 light:text-blue-700">{label}</span>
    </div>
  );
}
