import { describe, expect, it } from "vitest";
import { parseProducts } from "./product-parser";

describe("parseProducts", () => {
  it("does not treat trailing question text as a product", () => {
    expect(parseProducts("slack vs notion vs which one is good for our team management")).toEqual([
      "slack",
      "notion"
    ]);
  });

  it("strips use-case context from the final product", () => {
    expect(parseProducts("Compare Slack vs Notion for our team management")).toEqual([
      "Slack",
      "Notion"
    ]);
  });

  it("keeps normal multi-product comparisons", () => {
    expect(parseProducts("Compare AWS vs Azure vs Google Cloud")).toEqual([
      "AWS",
      "Azure",
      "Google Cloud"
    ]);
  });
});
