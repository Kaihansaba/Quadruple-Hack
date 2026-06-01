import { NextRequest, NextResponse } from "next/server";
import { runDecisionEngine } from "@/lib/engine/decision-engine";
import { computeRobustness } from "@/lib/engine/robustness";
import { getStoredComparison, updateStoredComparison } from "@/lib/server-comparison-store";
import type { DecisionEngineInput, Criterion } from "@/lib/engine/types";
import type { ReweightBody, ReweightResponse } from "@/lib/api-types";

function robustnessIterations() {
  const parsed = Number.parseInt(process.env.ROBUSTNESS_ITERATIONS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
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

  const body: ReweightBody & {
    engineInput?: DecisionEngineInput;
    criteria?: Criterion[];
  } = await req.json();

  const stored = getStoredComparison(id);
  const { weights } = body;
  const engineInput = stored?.engineInput ?? body.engineInput;
  const criteria = stored?.criteria ?? body.criteria ?? engineInput?.criteria;

  if (!engineInput || !criteria) {
    return NextResponse.json(
      { error: "Comparison state not found. Please rerun the comparison." },
      { status: 404 }
    );
  }

  const updatedCriteria: Criterion[] = criteria.map((c) => ({
    ...c,
    weight: weights[c.id] !== undefined ? weights[c.id] : c.weight
  }));

  const updatedInput: DecisionEngineInput = {
    ...engineInput,
    criteria: updatedCriteria
  };

  const result = runDecisionEngine(updatedInput);
  const robustness = computeRobustness(updatedInput, updatedCriteria, weightsFromCriteria(updatedCriteria), {
    iterations: robustnessIterations()
  });

  const response: ReweightResponse = {
    result,
    criteria: updatedCriteria,
    products: engineInput.products.map((p) => ({ id: p.id, name: p.name })),
    robustness
  };

  updateStoredComparison(id, {
    engineInput: updatedInput,
    criteria: updatedCriteria,
    products: response.products,
    result,
    robustness
  });

  return NextResponse.json(response);
}
