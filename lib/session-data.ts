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
