import { NextRequest, NextResponse } from "next/server";
import { computeRobustness } from "@/lib/engine/robustness";
import { getStoredComparison } from "@/lib/server-comparison-store";
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
  const { id } = await params;

  const body: Partial<RobustnessBody> = await req.json();
  const stored = getStoredComparison(id);
  const engineInput = stored?.engineInput ?? body.engineInput;

  if (!engineInput) {
    return NextResponse.json(
      { error: "Comparison state not found. Please rerun the comparison." },
      { status: 404 }
    );
  }

  const band = clampBand(body.band ?? 0.4);
  const criteria = stored?.criteria ?? engineInput.criteria;
  const weights = body.weights ?? weightsFromCriteria(criteria);
  const robustness = computeRobustness(engineInput, criteria, weights, {
    band,
    iterations: robustnessIterations()
  });

  return NextResponse.json({ robustness });
}
