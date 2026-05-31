import { NextRequest, NextResponse } from "next/server";
import { computeRobustness } from "@/lib/engine/robustness";
import type { Criterion } from "@/lib/engine/types";
import type { RobustnessBody } from "@/lib/api-types";

function robustnessIterations() {
  const parsed = Number.parseInt(process.env.ROBUSTNESS_ITERATIONS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
}

function clampBand(value: number) {
  if (!Number.isFinite(value)) return 0.4;
  return Math.min(0.6, Math.max(0.15, value));
}

function weightsFromCriteria(criteria: Criterion[]) {
  return Object.fromEntries(
    criteria
      .filter((criterion) => criterion.type === "soft")
      .map((criterion) => [criterion.id, criterion.weight ?? 0])
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await params;

  const body: RobustnessBody = await req.json();
  const band = clampBand(body.band);
  const weights = body.weights ?? weightsFromCriteria(body.engineInput.criteria);
  const robustness = computeRobustness(body.engineInput, body.engineInput.criteria, weights, {
    band,
    iterations: robustnessIterations()
  });

  return NextResponse.json({ robustness });
}
