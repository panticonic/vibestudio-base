import { describe, expect, it } from "vitest";
import { captureChannelMethodOffers } from "./method-offers.js";

describe("canonical channel method offers", () => {
  it("retains complete schemas and descriptions independently of mutable advertisements", () => {
    const method = {
      name: "inline_ui",
      description: "x".repeat(3_000),
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "y".repeat(17_000) },
        },
      },
    };
    const offers = captureChannelMethodOffers({ methods: [method] });
    expect(offers).toEqual([method]);
    method.parameters.properties.path.type = "number";
    expect(offers[0]!.parameters).toMatchObject({
      properties: { path: { type: "string" } },
    });
  });
  it("does not manufacture executable definitions from name-only summaries", () => {
    expect(
      captureChannelMethodOffers({
        methods: [{ name: "pause", description: "Pause" }],
      }),
    ).toEqual([]);
  });
  it("rejects invalid schema and duplicate offers without silently degrading the method", () => {
    expect(() =>
      captureChannelMethodOffers({
        methods: [
          {
            name: "eval",
            parameters: {
              type: "object",
              properties: {
                timeout: { type: "number", exclusiveMinimum: true },
              },
            },
          },
        ],
      }),
    ).toThrow(/Invalid JSON Schema.*eval.*exclusiveMinimum/);
    expect(() =>
      captureChannelMethodOffers({
        methods: [
          { name: "eval", parameters: {} },
          { name: "eval", parameters: {} },
        ],
      }),
    ).toThrow("Duplicate channel method advertisement: eval");
  });
  it("canonicalizes declaration order while preserving argument schemas", () => {
    expect(
      captureChannelMethodOffers({
        methods: [
          { name: "z", parameters: { type: "object" } },
          {
            name: "a",
            parameters: {
              type: "object",
              required: ["path"],
              properties: { path: { type: "string" } },
            },
          },
        ],
      }).map((offer) => offer.name),
    ).toEqual(["a", "z"]);
  });
});
