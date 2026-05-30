import { NextRequest, NextResponse } from "next/server";
import { jsonCall, narrateCall } from "@/lib/openrouter";
import { runDecisionEngine } from "@/lib/engine/decision-engine";
import { redistributeWeight } from "@/lib/engine/decision-engine";
import type { DecisionEngineInput, Criterion } from "@/lib/engine/types";
import type { ChatBody, ChatResponse } from "@/lib/api-types";
import type { Call1Output } from "@/lib/prompts";

type ChatRequestBody = ChatBody & {
  engineInput: DecisionEngineInput;
  criteria: Call1Output["criteria"];
  currentWeights: Record<string, number>;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await params;

  const body: ChatRequestBody = await req.json();
  const { message, engineInput, criteria, currentWeights, history } = body;

  // Ask the model to interpret the message as a weight adjustment or just a question
  const interpretPrompt = JSON.stringify({
    task: "Interpret the user's message in the context of a product comparison. Determine if they want to adjust weights or just ask a question.",
    available_criteria: criteria.map((c) => ({ id: c.id, name: c.name, current_weight: currentWeights[c.id] ?? c.weight })),
    user_message: message,
    instructions: [
      "Return JSON with keys: is_reweight (boolean), weight_adjustments (object or null), reply_needed (boolean).",
      "weight_adjustments: { criterion_id: new_weight_float } for criteria they mentioned changing.",
      "If the user says 'ignore price' or 'weight price as 0', set that criterion to 0.",
      "If the user says 'what if X mattered more', bump that criterion by 0.15.",
      "Do not adjust weights that weren't mentioned.",
      "is_reweight: true only if you have concrete weight adjustments to make."
    ]
  });

  let interpretation: { is_reweight: boolean; weight_adjustments: Record<string, number> | null } = {
    is_reweight: false,
    weight_adjustments: null
  };

  try {
    const raw = await jsonCall([
      { role: "system", content: "You interpret user messages about B2B product comparisons. Return JSON only." },
      ...history.slice(-6),
      { role: "user", content: interpretPrompt }
    ]);
    interpretation = JSON.parse(raw);
  } catch {
    // fall through, treat as plain question
  }

  let updatedResult = null;
  let updatedCriteria: Call1Output["criteria"] | null = null;
  let updatedProducts: Array<{ id: string; name: string }> | null = null;

  if (interpretation.is_reweight && interpretation.weight_adjustments) {
    let weights = { ...currentWeights };
    for (const [criterionId, newWeight] of Object.entries(interpretation.weight_adjustments)) {
      weights = redistributeWeight(weights, criterionId, newWeight);
    }

    const newCriteria: Criterion[] = engineInput.criteria.map((c) => ({
      ...c,
      weight: c.type === "soft" ? (weights[c.id] ?? c.weight) : c.weight
    }));

    const updatedInput: DecisionEngineInput = { ...engineInput, criteria: newCriteria };
    updatedResult = runDecisionEngine(updatedInput);
    updatedCriteria = newCriteria;
    updatedProducts = engineInput.products.map((p) => ({ id: p.id, name: p.name }));
  }

  // Generate reply
  const replyPrompt = updatedResult
    ? `The user asked: "${message}"\n\nI adjusted the weights as requested. The new ranking is: ${
        updatedResult.rankings
          .map((r, i) => `${i + 1}. ${engineInput.products.find((p) => p.id === r.productId)?.name} (${Math.round(r.score * 100)})${r.eliminated ? " [ELIMINATED]" : ""}`)
          .join(", ")
      }.\n\nExplain the change briefly in 2-3 sentences. Be specific about what shifted and why.`
    : `The user asked: "${message}"\n\nAnswer concisely based on the comparison context. Current ranking: ${
        body.engineInput
          ? "see context"
          : "not available"
      }`;

  let reply = "";
  try {
    reply = await narrateCall([
      {
        role: "system",
        content: "You are a B2B procurement assistant helping refine a vendor comparison. Be concise and specific."
      },
      ...history.slice(-6),
      { role: "user", content: replyPrompt }
    ]);
  } catch {
    reply = "I couldn't generate a response. Please try again.";
  }

  const response: ChatResponse = {
    reply,
    result: updatedResult,
    criteria: updatedCriteria,
    products: updatedProducts
  };

  return NextResponse.json(response);
}
