import { describe, expect, it } from "vitest";
import { call1Prompt, type Call1Output } from "./prompts";
import { buildStartResponse, formatIncomparableMessage } from "./start-response";
import { DEMO_PROFILE } from "./demo-profile";

const comparableCall1: Call1Output = {
  comparability: {
    verdict: "comparable",
    category: "team collaboration software",
    reason: "Both products support team collaboration workflows."
  },
  criteria: [
    {
      id: "ease_of_use",
      name: "Ease of use",
      unit: "score_0_10",
      direction: "higher",
      type: "soft",
      weight: 1
    }
  ],
  questions: [
    {
      id: "q1",
      category: "priorities",
      question: "What matters most?",
      suggested_answers: [{ label: "Ease of use", from_profile: false }]
    }
  ]
};

describe("start comparability", () => {
  it("adds comparability instructions to Call 1 without changing criteria/questions keys", () => {
    const prompt = JSON.parse(call1Prompt(["Slack", "Notion"], DEMO_PROFILE));

    expect(prompt.instructions.join("\n")).toContain("comparability");
    expect(prompt.instructions.join("\n")).toContain("Do NOT invent a shared category");
    expect(prompt.instructions.join("\n")).toContain("criteria (array), questions (array)");
  });

  it("adds force-compare instructions when the buyer continues after a warning", () => {
    const prompt = JSON.parse(call1Prompt(["Chrome", "ChatGPT Atlas"], DEMO_PROFILE, undefined, true));
    const instructions = prompt.instructions.join("\n");

    expect(prompt.task).toContain("explicitly chose to continue");
    expect(instructions).not.toContain('If "incomparable", set criteria=[] and questions=[]');
    expect(instructions).toContain("Do NOT return \"incomparable\"");
    expect(instructions).toContain("Use \"comparable_with_note\"");
  });

  it("proceeds as before for two comparable products", () => {
    const response = buildStartResponse({
      comparisonId: "cmp_test",
      products: ["Slack", "Notion"],
      parsed: comparableCall1
    });

    expect("status" in response ? response.status : undefined).toBeUndefined();
    expect(response).toMatchObject({
      comparisonId: "cmp_test",
      products: [
        { name: "Slack", url: null },
        { name: "Notion", url: null }
      ],
      criteria: comparableCall1.criteria,
      questions: comparableCall1.questions,
      comparability: comparableCall1.comparability
    });
  });

  it("proceeds with a carried note for comparable_with_note", () => {
    const parsed: Call1Output = {
      ...comparableCall1,
      comparability: {
        verdict: "comparable_with_note",
        category: "work management",
        reason: "They solve adjacent work management needs through different product approaches."
      }
    };

    const response = buildStartResponse({
      comparisonId: "cmp_note",
      products: ["Slack", "Notion"],
      parsed
    });

    expect("status" in response ? response.status : undefined).toBeUndefined();
    expect(response.comparability).toEqual(parsed.comparability);
    if (response.status === "incomparable") {
      throw new Error("Expected comparable_with_note to proceed");
    }
    expect(response.products.map((product) => product.name)).toEqual(["Slack", "Notion"]);
  });

  it("returns an incomparable response for a dog vs a plank of wood", () => {
    const response = buildStartResponse({
      comparisonId: "cmp_test",
      products: ["dog", "plank of wood"],
      parsed: {
        comparability: {
          verdict: "incomparable",
          category: null,
          reason: "A dog and a plank of wood do not share a meaningful buying decision frame.",
          incomparable_products: ["dog", "plank of wood"]
        },
        criteria: [],
        questions: []
      }
    });

    expect(response).toEqual({
      status: "incomparable",
      comparability: {
        verdict: "incomparable",
        category: null,
        reason: "A dog and a plank of wood do not share a meaningful buying decision frame.",
        incomparable_products: ["dog", "plank of wood"]
      }
    });
    if (response.status !== "incomparable") {
      throw new Error("Expected incomparable response");
    }
    expect(formatIncomparableMessage(response.comparability.reason)).toBe(
      "These don't look comparable: A dog and a plank of wood do not share a meaningful buying decision frame. Try comparing items in the same category."
    );
  });
});
