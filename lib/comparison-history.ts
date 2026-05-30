export type ComparisonHistoryItem = {
  id: string;
  title: string;
  href: string;
  status: "clarify" | "results";
  createdAt: string;
  updatedAt: string;
};

export const COMPARISON_HISTORY_EVENT = "verdict:comparison-history";

const STORAGE_KEY = "verdict:comparison-history:v1";
const MAX_ITEMS = 20;

export function readComparisonHistory(): ComparisonHistoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isHistoryItem).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function upsertComparisonHistory(
  nextItem: Omit<ComparisonHistoryItem, "createdAt" | "updatedAt"> &
    Partial<Pick<ComparisonHistoryItem, "createdAt" | "updatedAt">>
) {
  if (typeof window === "undefined") {
    return;
  }

  const now = new Date().toISOString();
  const existing = readComparisonHistory();
  const current = existing.find((item) => item.id === nextItem.id);
  const item: ComparisonHistoryItem = {
    id: nextItem.id,
    title: nextItem.title,
    href: nextItem.href,
    status: nextItem.status,
    createdAt: nextItem.createdAt ?? current?.createdAt ?? now,
    updatedAt: nextItem.updatedAt ?? now
  };

  const updated = [item, ...existing.filter((historyItem) => historyItem.id !== item.id)].slice(
    0,
    MAX_ITEMS
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event(COMPARISON_HISTORY_EVENT));
}

export function clearComparisonHistory() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(COMPARISON_HISTORY_EVENT));
}

function isHistoryItem(value: unknown): value is ComparisonHistoryItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<ComparisonHistoryItem>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.href === "string" &&
    (item.status === "clarify" || item.status === "results") &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}
