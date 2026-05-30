import type { Call1Output } from "./prompts";
import type { DecisionEngineResult } from "./engine/types";

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
};

export type ReweightBody = {
  weights: Record<string, number>;
};

export type ReweightResponse = {
  result: DecisionEngineResult;
  criteria: Call1Output["criteria"];
  products: Array<{ id: string; name: string }>;
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
