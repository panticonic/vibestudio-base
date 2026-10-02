import { describe, expect, it } from "vitest";
import { compareModelVersions } from "./catalog";

describe("model version ordering", () => {
  it("places newer major and minor versions ahead of older generations", () => {
    const names = [
      "GPT-5.5",
      "GPT-6 Luna",
      "GPT-5.6 Sol",
      "GPT-6.1 Sol",
      "GPT-6 Sol",
      "GPT-6 Astra",
      "GPT-5.6 Luna",
      "GPT-5.6 Terra",
    ];
    const models = names.map((name) => ({ name }));
    expect(
      [...models].sort(compareModelVersions).map((model) => model.name),
    ).toEqual([
      "GPT-6.1 Sol",
      "GPT-6 Astra",
      "GPT-6 Luna",
      "GPT-6 Sol",
      "GPT-5.6 Luna",
      "GPT-5.6 Sol",
      "GPT-5.6 Terra",
      "GPT-5.5",
    ]);
    expect(models.map((model) => model.name)).toEqual(names);
  });

  it("compares version components numerically and supports versions after variant names", () => {
    const models = [
      "Claude Opus 4.9",
      "Claude Sonnet 4.10",
      "Claude Opus 5",
      "Claude Haiku 4.10",
    ].map((name) => ({ name }));
    expect(
      models.sort(compareModelVersions).map((model) => model.name),
    ).toEqual([
      "Claude Opus 5",
      "Claude Haiku 4.10",
      "Claude Sonnet 4.10",
      "Claude Opus 4.9",
    ]);
  });

  it("uses alphabetical order for names without versions", () => {
    expect(
      [{ name: "Mistral Small" }, { name: "Mistral Large" }]
        .sort(compareModelVersions)
        .map((model) => model.name),
    ).toEqual(["Mistral Large", "Mistral Small"]);
  });
});
