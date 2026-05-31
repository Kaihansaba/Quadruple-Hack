import type { Call1Output } from "./prompts";
import type { DecisionEngineInput, DecisionEngineResult } from "./engine/types";

export type RobustnessResponse = {
  winFrequency: Record<string, number>;
  worstCaseRank: Record<string, number>;
  baseWinner: string;
  flipThreshold: number | null;
};

export type DocumentPage = {
  page: number;
  text: string;
};

export type Comparability = {
  verdict: "comparable" | "comparable_with_note" | "incomparable";
  category: string | null;
  reason: string;
  incomparable_products?: string[];
};

export type StartProduct = {
  name: string;
  url: string | null;
  documentText?: string;
  perPage?: DocumentPage[];
};

export type StartResponse = {
  status?: "ready";
  comparisonId: string;
  products: StartProduct[];
  detected_products?: Call1Output["detected_products"];
  criteria: Call1Output["criteria"];
  questions: Call1Output["questions"];
  comparability?: Comparability;
};

export type StartIncomparableResponse = {
  status: "incomparable";
  comparability: Comparability;
  detected_products?: Call1Output["detected_products"];
};

export type StartResult = StartResponse | StartIncomparableResponse;

export type ClarifyBody = {
  products?: StartProduct[];
  criteria?: Call1Output["criteria"];
  answers: Array<{ questionId: string; question: string; answer: string; category: string }>;
};

export type ClarifyResponse = {
  result: DecisionEngineResult;
  criteria: Call1Output["criteria"];
  products: Array<{ id: string; name: string }>;
  verdict: string;
  robustness: RobustnessResponse;
  engineInput?: DecisionEngineInput;
};

export type ReweightBody = {
  weights: Record<string, number>;
};

export type RobustnessBody = {
  engineInput: DecisionEngineInput;
  weights?: Record<string, number>;
  band: number;
};

export type ReweightResponse = {
  result: DecisionEngineResult;
  criteria: Call1Output["criteria"];
  products: Array<{ id: string; name: string }>;
  robustness: RobustnessResponse;
};

export type ChatBody = {
  message: string;
};

export type ChatResponse = {
  reply: string;
  result: DecisionEngineResult | null;
  criteria: Call1Output["criteria"] | null;
  products: Array<{ id: string; name: string }> | null;
};
