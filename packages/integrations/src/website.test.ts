import { describe, expect, it, vi } from "vitest";
import type { CredentialClient } from "@vibestudio/credential-client";
import {
  deployToCloudflarePages,
  deployToVercel,
  packageWebsite,
  verifyPublishedWebsite,
} from "./website.js";

describe("website publishing", () => {
  it("packages immutable artifacts without exposing private provenance publicly", async () => {
    const bytes = new TextEncoder().encode(
      'document.body.dataset.ready = "yes";',
    );
    const rpc = {
      call: vi.fn(async () => ({
        buildKey: "private-build-key",
        sourceStateHash: "state:private-source",
        artifacts: [
          {
            path: "site.js",
            role: "primary",
            contentType: "text/javascript",
            encoding: "utf8",
            byteLength: bytes.byteLength,
            integrity: null,
          },
        ],
        website: {
          entryArtifact: "site.js",
          declaration: { entry: "site.ts", title: "A <site>" },
        },
      })),
      stream: vi.fn(async () => new Response(bytes)),
    };
    const site = await packageWebsite(
      rpc as never,
      "@workspace-panels/site",
      "state:exact",
    );
    const manifest = new TextDecoder().decode(
      site.files.find((file) => file.path === "vibestudio-build.json")!.bytes,
    );
    const html = new TextDecoder().decode(
      site.files.find((file) => file.path === "index.html")!.bytes,
    );
    expect(site.artifactDigest).toBe(`sha256:${site.buildId}`);
    expect(manifest).not.toContain("private-build-key");
    expect(manifest).not.toContain("private-source");
    expect(html).toContain("A &lt;site&gt;");
    expect(site.privateReceipt).toEqual({
      buildKey: "private-build-key",
      sourceStateHash: "state:private-source",
    });
  });

  it("keeps the Cloudflare upload JWT host-held while userland runs the upload protocol", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const credentials = {
      beginWebsitePublication: vi.fn(async () => ({
        phase: "prepared", updatedAt: "now",
      })),
      recordWebsitePublication: vi.fn(async (_intent: unknown, progress: object) => ({
        ...progress, updatedAt: "now",
      })),
      resolveCredential: vi.fn(async () => ({ id: "api-token" })),
      deriveCredential: vi.fn(async () => ({ id: "host-held-upload-jwt" })),
      publishFetch: vi.fn(
        async (_publication, url: string, init?: RequestInit) => {
          calls.push({
            url,
            body: typeof init?.body === "string" ? init.body : "",
          });
          if (url.endsWith("check-missing"))
            return Response.json({
              result: JSON.parse(
                typeof init?.body === "string" ? init.body : "{}",
              ).hashes,
            });
          if (url.endsWith("/deployments"))
            return Response.json({
              result: { id: "deployment-1", url: "https://site.pages.dev/" },
            });
          return Response.json({ result: true });
        },
      ),
    } as unknown as CredentialClient;
    const file = {
      path: "index.html",
      contentType: "text/html",
      bytes: new TextEncoder().encode("hi"),
      sha256: "a".repeat(64),
    };
    const receipt = await deployToCloudflarePages({
      credentials,
      site: {
        buildId: "b".repeat(64),
        artifactDigest: `sha256:${"b".repeat(64)}`,
        entryArtifact: "site.js",
        files: [file],
        privateReceipt: { buildKey: "key", sourceStateHash: "state" },
      },
      operationId: "publish-1",
      accountId: "account",
      project: "project",
    });
    expect(credentials.deriveCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        publication: expect.objectContaining({
          operationId: "publish-1",
          provider: "cloudflare-pages",
        }),
        extract: { jsonPath: ["result", "jwt"] },
      }),
    );
    expect(calls.map(({ url }) => url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("check-missing"),
        expect.stringContaining("/upload"),
        expect.stringContaining("upsert-hashes"),
        expect.stringContaining("/deployments"),
      ]),
    );
    expect(
      JSON.parse(calls.find(({ url }) => url.endsWith("check-missing"))!.body)
        .hashes,
    ).toEqual(["cdaed1bde77fb199f872e76b58acd0fd"]);
    expect(JSON.stringify(calls)).not.toContain("host-held-upload-jwt");
    expect(receipt).toMatchObject({
      phase: "submitted",
      deploymentId: "deployment-1",
    });
    expect(credentials.recordWebsitePublication).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: "publish-1" }),
      { phase: "destination-ready" },
    );
    expect(credentials.recordWebsitePublication).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: "publish-1" }),
      { phase: "uploaded" },
    );
    expect(credentials.recordWebsitePublication).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: "publish-1" }),
      expect.objectContaining({ phase: "submitted", deploymentId: "deployment-1" }),
    );
  });

  it("returns a finished Vercel intent without posting to the provider again", async () => {
    const credentials = {
      resolveCredential: vi.fn(async () => ({ id: "api-token" })),
      beginWebsitePublication: vi.fn(async () => ({
        phase: "submitted",
        deploymentId: "deployment-1",
        url: "https://site.example",
        updatedAt: "recorded",
      })),
      recordWebsitePublication: vi.fn(),
      publishFetch: vi.fn(),
    } as unknown as CredentialClient;
    const receipt = await deployToVercel({
      credentials,
      site: {
        buildId: "b".repeat(64), artifactDigest: `sha256:${"b".repeat(64)}`,
        entryArtifact: "index.js", files: [],
        privateReceipt: { buildKey: "key", sourceStateHash: "state" },
      },
      operationId: "publish-done", project: "site",
    });
    expect(receipt).toMatchObject({ phase: "submitted", deploymentId: "deployment-1" });
    expect(credentials.publishFetch).not.toHaveBeenCalled();
  });

  it("resumes Cloudflare after the uploaded checkpoint without creating a project or reuploading assets", async () => {
    const urls: string[] = [];
    const credentials = {
      resolveCredential: vi.fn(async () => ({ id: "api-token" })),
      beginWebsitePublication: vi.fn(async () => ({ phase: "uploaded", updatedAt: "recorded" })),
      recordWebsitePublication: vi.fn(async (_intent: unknown, progress: object) => ({
        ...progress,
        updatedAt: "recorded",
      })),
      deriveCredential: vi.fn(),
      publishFetch: vi.fn(async (_publication, url: string) => {
        urls.push(url);
        return Response.json({ result: { id: "deployment-2", url: "https://site.pages.dev/" } });
      }),
    } as unknown as CredentialClient;
    const receipt = await deployToCloudflarePages({
      credentials,
      site: {
        buildId: "d".repeat(64), artifactDigest: `sha256:${"d".repeat(64)}`,
        entryArtifact: "index.js",
        files: [{ path: "index.html", contentType: "text/html", bytes: new TextEncoder().encode("hi"), sha256: "e".repeat(64) }],
        privateReceipt: { buildKey: "key", sourceStateHash: "state" },
      },
      operationId: "publish-uploaded", accountId: "account", project: "project",
    });
    expect(urls).toEqual([
      "https://api.cloudflare.com/client/v4/accounts/account/pages/projects/project/deployments",
    ]);
    expect(credentials.deriveCredential).not.toHaveBeenCalled();
    expect(receipt).toMatchObject({ phase: "submitted", deploymentId: "deployment-2" });
  });

  it("verifies public build identity before marking a deployment complete", async () => {
    const buildId = "c".repeat(64);
    const receipt = await verifyPublishedWebsite(
      {
        operationId: "publish-2",
        provider: "vercel",
        destination: "site",
        environment: "preview",
        artifactDigest: `sha256:${buildId}`,
        phase: "submitted",
        url: "https://site.example/",
        updatedAt: "before",
      },
      async () => Response.json({ buildId }),
    );
    expect(receipt).toMatchObject({ phase: "submitted", verifiedAt: expect.any(String) });
  });
});
