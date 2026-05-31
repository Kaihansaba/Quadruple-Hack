const SESSION_PREFIX = "verdict:comparison-session:v1:";

export function parseSessionData<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (firstError) {
    try {
      return JSON.parse(decodeURIComponent(raw)) as T;
    } catch {
      throw firstError;
    }
  }
}

export function saveSessionData<T>(id: string, data: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${SESSION_PREFIX}${id}`, JSON.stringify(data));
}

export function readSessionData<T>(id: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(`${SESSION_PREFIX}${id}`);
  if (!raw) {
    return null;
  }

  return parseSessionData<T>(raw);
}
