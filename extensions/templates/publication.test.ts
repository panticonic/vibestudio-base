import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import YAML from "yaml";
import { expect, it, vi } from "vitest";
import { createTemplatePublisher } from "./publication.js";
import {
  parseTemplateManifestContent,
  rootRuntimeFromTemplateManifest,
} from "@vibestudio/workspace/templateManifest";
import type { ExtensionContextLike } from "./context.js";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";

it("records its own upstream and overrides, and retries an uncertain main push without publishing again", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "template-publication-test-"),
  );
  try {
    const pin = {
      url: "git+https://github.com/team/base.git",
      ref: "refs/tags/v1",
      commit: "a".repeat(40),
    };
    const source = YAML.stringify({
      systemEpoch: 0,
      defaultRepo: "projects/example",
      template: {  },
    });
  const installation = { sources: [{ pin, manifest: source }] };
    const initial = YAML.stringify({
      systemEpoch: 0,
      defaultRepo: "projects/example",
      template: {
        dependencies: [{ url: pin.url }],

      },
    });
    const manifest = parseTemplateManifestContent(initial, 0);
    const release = YAML.stringify({
      systemEpoch: 0,
      template: {
        name: "Mine",
        description: "Mine",
        dependencies: [{ url: pin.url }],
        overrides: [{ repoPath: "projects/example", source: pin.url }],
      },
    });
    const request = {
      commandId: "publication-one",
      intent: {
        name: "Mine",
        description: "Mine",
        parts: ["projects/example"],
      },
      expectedRemoteCommit: null,
    expectedFingerprint: `v1-sha256:${"b".repeat(64)}` as const,
      version: "1.0.0",
      destination: { provider: "github", owner: "alice", name: "mine" },
    };
    const plan = {
      request: request.intent,
      mainEventId: "before",
      selectableParts: ["projects/example"],
      requestedParts: request.intent.parts,
      includedParts: ["meta", "projects/example"],
      requiredParts: ["meta"],
      manifest: release,
      manifestDigest: `v1-sha256:${"c".repeat(64)}` as const,
      fingerprint: request.expectedFingerprint,
    };
    const published = {
      operationId: request.commandId,
      destination: request.destination,
      created: true,
      remoteUrl: "https://github.com/alice/mine.git",
      webUrl: "https://github.com/alice/mine",
      templateUrl: "git+https://github.com/alice/mine.git",
      credential: "Publish account",
      ref: "refs/tags/v1.0.0",
      commit: "d".repeat(40),
      parts: plan.includedParts,
    };
    let text = initial,
      main = "before",
      head = "before",
      lost = true;
    const pushes: unknown[] = [];
    const invoke = vi.fn().mockResolvedValue(published);
    const call = vi.fn(
      async (_target: string, method: string, args: unknown[]) => {
        const input = (args[0] ?? {}) as Record<string, unknown>;
        if (method === "runtime.createContext")
          return { contextId: input["contextId"] };
        if (method === "vcs.status")
          return {
            contextId: input["contextId"],
            mainEventId: main,
            workingHead: { kind: "event", eventId: head },
            committed: { kind: "event", eventId: head },
            clean: true,
            mainRelation: "at",
            workingCounts: { applications: 0, workUnits: 0, changes: 0 },
          };
        if (method === "vcs.resolveRepository")
          return {
            state: input["state"],
            repositoryId: "meta",
            repoPath: "meta",
          };
        if (method === "vcs.readFile")
          return {
            repositoryId: "meta",
            fileId: "manifest",
            repoPath: "meta",
            path: "vibestudio.yml",
            contentHash: "blob",
            authoredChangeId: "change",
            authoredByWorkUnitId: "work",
            contentClass: "internal",
            externalKeys: [],
            mode: 0o644,
            content: { kind: "text", text },
          };
        if (method === "vcs.edit") {
          text = (
            input["changes"] as Array<{ edits: Array<{ text: string }> }>
          )[0]!.edits[0]!.text;
          head = "edited";
          return {
            commandId: input["commandId"],
            contextId: input["contextId"],
            workUnitId: "work:publication",
            applicationId: "application:publication",
            changeCount: 1,
            changeIds: ["change:publication"],
            incorporatedChangeCount: 0,
            incorporatedChangeIds: [],
            decisionIds: [],
            workingHead: { kind: "event", eventId: head },
          };
        }
        if (method === "vcs.commit") {
          head = "published";
          return {
            contextId: input["contextId"],
            event: { kind: "event", eventId: head },
            committedApplicationIds: ["application:publication"],
            integrationSourceEventIds: [],
          };
        }
        if (method === "vcs.push") {
          pushes.push(input);
          main = "published";
          if (lost) {
            lost = false;
            throw new Error("response lost");
          }
          return {
            contextId: input["contextId"],
            eventId: input["expectedCommittedEventId"],
            mainEventId: "published",
            effectId: "effect:publication",
            appliedAt: "2026-07-15T00:00:00.000Z",
          };
        }
        throw new Error(`Unexpected ${method}`);
      },
    );
    const ctx = {
      storage: { root },
      rpc: schemaRpcMock({ call }),
      extensions: { invoke },
    } as unknown as ExtensionContextLike;
    const inspect = vi.fn().mockResolvedValue({
      observation: {
        mainEventId: "before",
        mainState: { kind: "event", eventId: "before" },
        runtimeTop: rootRuntimeFromTemplateManifest(manifest),
        manifest,
        installation,
        localRepoPaths: new Set(["meta", "projects/example"]),
        templateDependencies: manifest.dependencies,
        templateSources: [pin],
      },
      plan,
    });
    await expect(
      createTemplatePublisher(ctx, inspect)(request),
    ).rejects.toThrow("response lost");
    const recorded = parseTemplateManifestContent(text, 0);
    expect((pushes[0] as { templateInstallation: { upstream: { url: string } } }).templateInstallation.upstream.url).toBe(published.templateUrl);
    expect((pushes[0] as { templateInstallation: { upstream: { credential: string } } }).templateInstallation.upstream.credential).toBe("Publish account");
    expect(recorded.dependencies).toEqual([{ url: pin.url }]);
    expect(recorded.overrides).toEqual([
      { repoPath: "projects/example", source: pin.url },
    ]);
    expect(rootRuntimeFromTemplateManifest(recorded).defaultRepo).toBe(
      "projects/example",
    );
    await expect(
      createTemplatePublisher(ctx, inspect)(request),
    ).resolves.toEqual(published);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(pushes[1]).toEqual(pushes[0]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
