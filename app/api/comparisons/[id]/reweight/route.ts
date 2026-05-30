import { NextRequest, NextResponse } from "next/server";
import { runDecisionEngine } from "@/lib/engine/decision-engine";
import type { DecisionEngineInput, Criterion } from "@/lib/engine/types";
import type { ReweightBody, ReweightResponse } from "@/lib/api-types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await params;

  const body: ReweightBody & {
    engineInput: DecisionEngineInput;
    criteria: Criterion[];
  } = await req.json();

  const { weights, engineInput, criteria } = body;

  const updatedCriteria: Criterion[] = criteria.map((c) => ({
    ...c,
    weight: weights[c.id] !== undefined ? weights[c.id] : c.weight
  }));

  const updatedInput: DecisionEngineInput = {
    ...engineInput,
    criteria: updatedCriteria
  };

  const result = runDecisionEngine(updatedInput);

  const response: ReweightResponse = {
    result,
    criteria: updatedCriteria,
    products: engineInput.products.map((p) => ({ id: p.id, name: p.name }))
  };

  return NextResponse.json(response);
}
