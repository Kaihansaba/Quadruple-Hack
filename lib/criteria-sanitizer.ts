import type { Call1Output, CompanyProfile } from "./prompts";

const COMPLIANCE_PATTERN =
  /\b(compliance|hipaa|soc\s*2|soc2|gdpr|iso\s*27001|iso27001|pci|certification|regulatory|audit|attestation)\b/i;

function mentionsCompliance(text: string): boolean {
  return COMPLIANCE_PATTERN.test(text);
}

export function sanitizeCall1OutputForProfile(
  output: Call1Output,
  profile: CompanyProfile
): Call1Output {
  const hasComplianceRequirements = profile.compliance_reqs.length > 0;

  const criteria = output.criteria
    .filter((criterion) => hasComplianceRequirements || !mentionsCompliance(`${criterion.id} ${criterion.name}`))
    .map((criterion) => {
      if (criterion.type === "hard" && !hasComplianceRequirements) {
        return { ...criterion, type: "soft" as const, weight: criterion.weight ?? 0 };
      }
      return criterion;
    });

  const softCriteria = criteria.filter((criterion) => criterion.type === "soft");
  const totalWeight = softCriteria.reduce((sum, criterion) => sum + (criterion.weight ?? 0), 0);
  const fallbackWeight = softCriteria.length > 0 ? 1 / softCriteria.length : 0;
  const normalizedCriteria = criteria.map((criterion) => {
    if (criterion.type === "hard") {
      return { ...criterion, weight: null };
    }

    return {
      ...criterion,
      weight: totalWeight > 0 ? (criterion.weight ?? 0) / totalWeight : fallbackWeight
    };
  });

  const questions = output.questions.filter((question) => {
    if (hasComplianceRequirements) {
      return true;
    }

    const labels = question.suggested_answers.map((answer) => answer.label).join(" ");
    return question.category !== "dealbreakers" && !mentionsCompliance(`${question.question} ${labels}`);
  });

  return {
    detected_products: output.detected_products,
    comparability: output.comparability,
    criteria: normalizedCriteria,
    questions
  };
}
