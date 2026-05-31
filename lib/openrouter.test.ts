import { describe, expect, it } from "vitest";
import { extractJsonFromModelResponse } from "./openrouter";

describe("extractJsonFromModelResponse", () => {
  it("parses clean JSON unchanged", () => {
    const raw = "{\"ok\":true,\"items\":[1,2]}";

    expect(extractJsonFromModelResponse(raw)).toEqual({
      json: raw,
      path: "direct"
    });
  });

  it("parses fenced JSON from a wrapped response", () => {
    const parsed = extractJsonFromModelResponse(
      "Here is the result:\n\n```json\n{\"pricing_models\":[{\"product_name\":\"Nimbus\"}]}\n```"
    );

    expect(parsed).toEqual({
      json: "{\"pricing_models\":[{\"product_name\":\"Nimbus\"}]}",
      path: "fenced"
    });
  });

  it("parses prose-wrapped JSON by extracting a balanced object", () => {
    const parsed = extractJsonFromModelResponse(
      "I searched current sources and found this result: {\"pricing_model\":{\"notes\":\"brace } inside string\",\"confidence\":0.2}} Thanks."
    );

    expect(parsed).toEqual({
      json: "{\"pricing_model\":{\"notes\":\"brace } inside string\",\"confidence\":0.2}}",
      path: "balanced"
    });
  });

  it("parses prose-wrapped JSON arrays", () => {
    const parsed = extractJsonFromModelResponse("Result follows:\n[{\"product\":\"A\"},{\"product\":\"B\"}]\nDone.");

    expect(parsed).toEqual({
      json: "[{\"product\":\"A\"},{\"product\":\"B\"}]",
      path: "balanced"
    });
  });
});
