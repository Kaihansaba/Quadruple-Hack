import type { RobustnessResponse } from "./api-types";
import type { Criterion, DecisionEngineInput, DecisionEngineResult } from "./engine/types";

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type StoredComparison = {
  engineInput: DecisionEngineInput;
  criteria: Criterion[];
  products: Array<{ id: string; name: string }>;
  result: DecisionEngineResult;
  robustness: RobustnessResponse;
  verdict: string;
  messages: StoredMessage[];
  updatedAt: string;
};

type GlobalWithStore = typeof globalThis & {
  __verdictComparisonStore?: Map<string, StoredComparison>;
};

function store() {
  const globalStore = globalThis as GlobalWithStore;
  globalStore.__verdictComparisonStore ??= new Map<string, StoredComparison>();
  return globalStore.__verdictComparisonStore;
}

export function getStoredComparison(id: string): StoredComparison | null {
  return store().get(id) ?? null;
}

export function saveStoredComparison(id: string, comparison: Omit<StoredComparison, "updatedAt">) {
  store().set(id, {
    ...comparison,
    updatedAt: new Date().toISOString()
  });
}

export function updateStoredComparison(
  id: string,
  patch: Partial<Omit<StoredComparison, "updatedAt">>
): StoredComparison | null {
  const current = getStoredComparison(id);
  if (!current) return null;

  const next: StoredComparison = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  store().set(id, next);
  return next;
}
