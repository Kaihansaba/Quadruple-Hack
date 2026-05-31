import type { Call1Output } from "./prompts";
import type { DecisionEngineInput, DecisionEngineResult } from "./engine/types";

export type RobustnessResponse = {
  winFrequency: Record<string, number>;
  worstCaseRank: Record<string, number>;
  baseWinner: string;
  flipThreshold: number | null;
};

export type StartResponse = {
  comparisonId: string;
  products: Array<{ name: string; url: string | null }>;
  criteria: Call1Output["criteria"];
  questions: Call1Output["questions"];
};

export type ClarifyBody = {
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
