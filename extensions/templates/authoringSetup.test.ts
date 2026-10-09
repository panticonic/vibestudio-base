import { expect, it } from "vitest";
import { nextPublicationVersion, templateAuthoringSetup } from "./authoring.js";
import { parseTemplateManifestContent } from "@vibestudio/workspace/templateManifest";
import type { SemanticWorkspaceObservation } from "./workspace.js";
it("derives local authored contents from the source tree and marks dependency units inherited", () => {
  const manifest = parseTemplateManifestContent(
    `systemEpoch: 0
template:
  name: Personal
  description: Personal tools
  dependencies:
    - url: git+https://example.test/base.git
  overrides:
    - repoPath: panels/chat
      source: git+https://example.test/base.git
`,
    0,
  );
  const setup = templateAuthoringSetup(
    {
      manifest,
      localRepoPaths: new Set([
        "meta",
        "panels/personal",
        "panels/chat",
        "packages/runtime",
        "projects/scratch",
      ]),
    } as SemanticWorkspaceObservation,
    new Map([
      ["panels/chat", "git+https://example.test/base.git"],
      ["packages/runtime", "git+https://example.test/base.git"],
    ]),
  );
  expect(setup.name).toBe("Personal");
  expect(setup.description).toBe("Personal tools");
  expect(
    setup.parts
      .filter((part) => part.ownership === "authored")
      .map((part) => part.repoPath),
  ).toEqual(["panels/chat", "panels/personal", "projects/scratch"]);
  expect(
    setup.parts.find((part) => part.repoPath === "projects/scratch")?.ownership,
  ).toBe("authored");
  expect(setup.dependencies).toEqual([
    { url: "git+https://example.test/base.git" },
  ]);
});
it("suggests the next patch from numeric stable tags, independent of API order", () => {
  expect(
    nextPublicationVersion([
      "v1.9.12",
      "v1.10.2",
      "v2.0.0-beta.1",
      "deploy",
      "v1.10.1",
    ]),
  ).toEqual({ latest: "1.10.2", suggested: "1.10.3" });
  expect(nextPublicationVersion(["v1", "v1.9"])).toEqual({
    latest: "1.9.0",
    suggested: "1.9.1",
  });
  expect(nextPublicationVersion([])).toEqual({
    latest: null,
    suggested: "1.0.0",
  });
});
