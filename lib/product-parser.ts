const QUESTION_START_PATTERN =
  /^(which|what|who|how|why|when|where|should|would|could|can|is|are|do|does|did)\b/i;

const QUESTION_CLAUSE_PATTERN =
  /\b(which|what|who|how|why|when|where|should|would|could|can|is|are|do|does|did)\b.*$/i;

const CONTEXT_TRAIL_PATTERN =
  /\s+(for|to)\s+(our|my|the|this|team|company|business|use|use case|workflow|workflows)\b.*$/i;

export function parseProducts(query: string): string[] {
  const cleaned = query
    .replace(/\bcompare\b/gi, "")
    .replace(/[?!.]+$/g, "")
    .trim();

  const parts = cleaned
    .split(/\s+vs\.?\s+|\s+versus\s+|,\s*|\s+and\s+/i)
    .map(cleanProductSegment)
    .filter(Boolean);

  return [...new Set(parts)];
}

function cleanProductSegment(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed || QUESTION_START_PATTERN.test(trimmed)) {
    return "";
  }

  return trimmed
    .replace(QUESTION_CLAUSE_PATTERN, "")
    .replace(CONTEXT_TRAIL_PATTERN, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}
