import type {
  CredentialClient,
  StoredCredentialSummary,
  UrlAudience,
  WebsitePublicationIntent,
  WebsitePublicationReceipt,
} from "@vibestudio/credential-client";
import type { RpcCaller } from "@vibestudio/rpc";
import { blake3 } from "@noble/hashes/blake3.js";

export interface WebsiteArtifactEntry {
  path: string;
  role: "primary" | "css" | "map" | "asset";
  contentType: string;
  encoding: "utf8" | "base64";
  byteLength: number;
  integrity: string | null;
}

export interface WebsiteBuildHandle {
  buildKey: string;
  sourceStateHash: string | null;
  artifacts: WebsiteArtifactEntry[];
  website: { entryArtifact: string; declaration: Record<string, unknown> };
}

export interface WebsiteFile {
  path: string;
  contentType: string;
  bytes: Uint8Array;
  sha256: string;
}

export interface WebsitePackage {
  buildId: string;
  artifactDigest: `sha256:${string}`;
  entryArtifact: string;
  files: WebsiteFile[];
  privateReceipt: {
    buildKey: string;
    sourceStateHash: string | null;
  };
}

/** The host journal's record of one reviewed publication operation. */
export type PublicationReceipt = WebsitePublicationReceipt;

/** A submitted publication whose public URL serves the published build. */
export type VerifiedPublication = PublicationReceipt & { verifiedAt: string };

const encoder = new TextEncoder();

function assertSafePath(value: string): void {
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").includes("..")
  ) {
    throw new Error(`Unsafe website artifact path: ${value}`);
  }
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function digest(
  algorithm: "SHA-1" | "SHA-256",
  bytes: Uint8Array,
): Promise<string> {
  return hex(await crypto.subtle.digest(algorithm, exactArrayBuffer(bytes)));
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function cloudflarePagesHash(file: WebsiteFile): string {
  const baseName = file.path.split("/").at(-1) ?? file.path;
  const dot = baseName.lastIndexOf(".");
  const extension = dot < 0 ? "" : baseName.slice(dot + 1);
  return Array.from(
    blake3(
      new TextEncoder().encode(`${bytesToBase64(file.bytes)}${extension}`),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function responseError(
  response: Response,
  action: string,
): Promise<never> {
  const text = (await response.text()).slice(0, 2_000);
  throw new Error(
    `${action} failed (${response.status} ${response.statusText})${text ? `: ${text}` : ""}`,
  );
}

async function json<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) return responseError(response, action);
  return (await response.json()) as T;
}

export async function packageWebsite(
  rpc: Pick<RpcCaller, "call" | "stream">,
  unit: string,
  exactRef: `ctx:${string}` | `state:${string}`,
): Promise<WebsitePackage> {
  const handle = await rpc.call<WebsiteBuildHandle>(
    "main",
    "build.buildWebsite",
    [unit, exactRef],
  );
  if (!handle.website)
    throw new Error("The build did not return a website declaration");
  const files: WebsiteFile[] = [];
  for (const artifact of handle.artifacts) {
    assertSafePath(artifact.path);
    const response = await rpc.stream("main", "build.readBuildArtifact", [
      handle.buildKey,
      artifact.path,
    ]);
    if (!response.ok) await responseError(response, `Read ${artifact.path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha256 = await digest("SHA-256", bytes);
    if (artifact.integrity && !artifact.integrity.endsWith(sha256)) {
      throw new Error(`Artifact integrity mismatch: ${artifact.path}`);
    }
    files.push({
      path: artifact.path,
      contentType: artifact.contentType,
      bytes,
      sha256,
    });
  }
  const title =
    typeof handle.website.declaration["title"] === "string"
      ? handle.website.declaration["title"]
      : unit;
  const css = files
    .filter((file) => file.path.endsWith(".css"))
    .map((file) => `<link rel="stylesheet" href="./${file.path}">`)
    .join("");
  const indexBytes = encoder.encode(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${css}</head><body><div id="root"></div><script type="module" src="./${handle.website.entryArtifact}"></script></body></html>`,
  );
  files.push({
    path: "index.html",
    contentType: "text/html; charset=utf-8",
    bytes: indexBytes,
    sha256: await digest("SHA-256", indexBytes),
  });
  const noJekyll = new Uint8Array();
  files.push({
    path: ".nojekyll",
    contentType: "application/octet-stream",
    bytes: noJekyll,
    sha256: await digest("SHA-256", noJekyll),
  });
  files.sort((a, b) => a.path.localeCompare(b.path));
  const buildId = await digest(
    "SHA-256",
    encoder.encode(
      stable(
        files.map(({ path, sha256, bytes }) => ({
          path,
          sha256,
          size: bytes.byteLength,
        })),
      ),
    ),
  );
  const publicManifest = encoder.encode(
    `${stable({ version: 1, buildId, entry: handle.website.entryArtifact, files: files.map(({ path, sha256, bytes }) => ({ path, sha256, size: bytes.byteLength })) })}\n`,
  );
  files.push({
    path: "vibestudio-build.json",
    contentType: "application/json",
    bytes: publicManifest,
    sha256: await digest("SHA-256", publicManifest),
  });
  return {
    buildId,
    artifactDigest: `sha256:${buildId}`,
    entryArtifact: handle.website.entryArtifact,
    files,
    privateReceipt: {
      buildKey: handle.buildKey,
      sourceStateHash: handle.sourceStateHash,
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function intent(
  operationId: string,
  site: WebsitePackage,
  provider: string,
  destination: string,
  environment: "preview" | "production",
): WebsitePublicationIntent {
  return {
    operationId,
    artifactDigest: site.artifactDigest,
    provider,
    destination,
    environment,
  };
}

const bearer = {
  type: "header" as const,
  name: "authorization",
  valueTemplate: "Bearer {token}",
  stripIncoming: ["authorization"],
};

export async function connectVercelForPublishing(
  credentials: CredentialClient,
): Promise<StoredCredentialSummary> {
  const audience = [
    { url: "https://api.vercel.com/", match: "origin" as const },
  ];
  return credentials.requestCredentialInput({
    title: "Connect Vercel publishing",
    description:
      "Store a Vercel access token in the Host for mediated website publication.",
    credential: {
      label: "Vercel publishing",
      audience,
      injection: bearer,
      bindings: [
        {
          id: "vercel-publish",
          label: "Vercel website publishing",
          use: "publish",
          audience,
          injection: bearer,
        },
      ],
      metadata: { providerId: "vercel", purpose: "website-publishing" },
    },
    fields: [
      {
        name: "token",
        label: "Vercel access token",
        type: "secret",
        required: true,
      },
    ],
    material: { type: "bearer-token", tokenField: "token" },
  });
}

export async function connectCloudflarePagesForPublishing(
  credentials: CredentialClient,
): Promise<StoredCredentialSummary> {
  const audience = [
    {
      url: "https://api.cloudflare.com/client/v4/",
      match: "path-prefix" as const,
    },
  ];
  return credentials.requestCredentialInput({
    title: "Connect Cloudflare Pages publishing",
    description:
      "Store a Cloudflare API token with Pages write access in the Host.",
    credential: {
      label: "Cloudflare Pages publishing",
      audience,
      injection: bearer,
      bindings: [
        {
          id: "cloudflare-pages-publish",
          label: "Cloudflare Pages publishing",
          use: "publish",
          audience,
          injection: bearer,
        },
      ],
      metadata: {
        providerId: "cloudflare-pages",
        purpose: "website-publishing",
      },
    },
    fields: [
      {
        name: "token",
        label: "Cloudflare API token",
        type: "secret",
        required: true,
      },
    ],
    material: { type: "bearer-token", tokenField: "token" },
  });
}

async function publishingCredential(
  credentials: CredentialClient,
  url: string,
  credentialId?: string,
): Promise<StoredCredentialSummary> {
  const resolved = await credentials.resolveCredential({
    url,
    credentialId,
    use: "publish",
  });
  if (!resolved)
    throw new Error(
      `Connect a publication credential for ${new URL(url).origin}`,
    );
  return resolved;
}

/**
 * Run one reviewed publication from the host journal's last completed phase.
 * The host binds the operation id to the exact artifact and destination, so a
 * retry with the same id resumes (or returns the submitted receipt) and a
 * changed artifact or destination is refused before any provider request.
 */
async function publishFromJournal(
  credentials: CredentialClient,
  publication: WebsitePublicationIntent,
  steps: {
    prepareDestination?: () => Promise<void>;
    upload: () => Promise<void>;
    submit: () => Promise<{ deploymentId: string; url: string }>;
  },
): Promise<PublicationReceipt> {
  let receipt = await credentials.beginWebsitePublication(publication);
  if (receipt.phase === "prepared" && steps.prepareDestination) {
    await steps.prepareDestination();
    receipt = await credentials.recordWebsitePublication(publication, {
      phase: "destination-ready",
    });
  }
  if (receipt.phase === "prepared" || receipt.phase === "destination-ready") {
    await steps.upload();
    receipt = await credentials.recordWebsitePublication(publication, {
      phase: "uploaded",
    });
  }
  if (receipt.phase === "uploaded") {
    const deployment = await steps.submit();
    receipt = await credentials.recordWebsitePublication(publication, {
      phase: "submitted",
      ...deployment,
    });
  }
  return receipt;
}

export async function deployToVercel(input: {
  credentials: CredentialClient;
  site: WebsitePackage;
  operationId: string;
  project: string;
  teamId?: string;
  environment?: "preview" | "production";
  credentialId?: string;
}): Promise<PublicationReceipt> {
  const environment = input.environment ?? "preview";
  const destination = input.teamId
    ? `${input.teamId}/${input.project}`
    : input.project;
  const publication = intent(
    input.operationId,
    input.site,
    "vercel",
    destination,
    environment,
  );
  const query = input.teamId
    ? `?teamId=${encodeURIComponent(input.teamId)}`
    : "";
  const audience: UrlAudience[] = [
    { url: `https://api.vercel.com/v2/files${query}`, match: "exact" },
    { url: `https://api.vercel.com/v13/deployments${query}`, match: "exact" },
  ];
  const credential = await publishingCredential(
    input.credentials,
    audience[0]!.url,
    input.credentialId,
  );
  const deploymentFiles = await Promise.all(
    input.site.files.map(async (file) => ({
      file: file.path,
      sha: await digest("SHA-1", file.bytes),
      size: file.bytes.byteLength,
    })),
  );
  return publishFromJournal(input.credentials, publication, {
    upload: async () => {
      for (const [index, file] of input.site.files.entries()) {
        const response = await input.credentials.publishFetch(
          publication,
          audience[0]!.url,
          {
            method: "POST",
            headers: {
              "Content-Type": file.contentType,
              "x-vercel-digest": deploymentFiles[index]!.sha,
              "Content-Length": String(file.bytes.byteLength),
            },
            body: exactArrayBuffer(file.bytes),
          },
          { credentialId: credential.id, audiences: audience },
        );
        if (!response.ok && response.status !== 409)
          await responseError(response, `Upload ${file.path}`);
      }
    },
    submit: async () => {
      const deployment = await json<{ id: string; url: string }>(
        await input.credentials.publishFetch(
          publication,
          audience[1]!.url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: input.project,
              files: deploymentFiles,
              projectSettings: { framework: null },
              ...(environment === "production" ? { target: "production" } : {}),
            }),
          },
          { credentialId: credential.id, audiences: audience },
        ),
        "Create Vercel deployment",
      );
      return { deploymentId: deployment.id, url: `https://${deployment.url}` };
    },
  });
}

export async function deployToCloudflarePages(input: {
  credentials: CredentialClient;
  site: WebsitePackage;
  operationId: string;
  accountId: string;
  project: string;
  branch?: string;
  productionBranch?: string;
  environment?: "preview" | "production";
  credentialId?: string;
}): Promise<PublicationReceipt> {
  const environment =
    input.environment ?? (input.branch ? "preview" : "production");
  const destination = `${input.accountId}/${input.project}`;
  const publication = intent(
    input.operationId,
    input.site,
    "cloudflare-pages",
    destination,
    environment,
  );
  const projectsBase = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(input.accountId)}/pages/projects`;
  const projectBase = `${projectsBase}/${encodeURIComponent(input.project)}`;
  const apiAudience: UrlAudience[] = [
    { url: projectsBase, match: "exact" },
    { url: projectBase, match: "exact" },
    { url: `${projectBase}/upload-token`, match: "exact" },
    { url: `${projectBase}/deployments`, match: "exact" },
  ];
  const primary = await publishingCredential(
    input.credentials,
    projectBase,
    input.credentialId,
  );
  const assetUrls = ["check-missing", "upload", "upsert-hashes"].map(
    (name) => `https://api.cloudflare.com/client/v4/pages/assets/${name}`,
  );
  const assetAudience = assetUrls.map((url) => ({
    url,
    match: "exact" as const,
  }));
  const hashToFile = new Map(
    input.site.files.map((file) => {
      if (file.bytes.byteLength > 25 * 1024 * 1024) {
        throw new Error(`Cloudflare Pages asset exceeds 25 MiB: ${file.path}`);
      }
      return [cloudflarePagesHash(file), file];
    }),
  );
  const hashes = [...hashToFile.keys()];
  return publishFromJournal(input.credentials, publication, {
    prepareDestination: async () => {
      const existingProject = await input.credentials.publishFetch(
        publication,
        projectBase,
        { method: "GET" },
        { credentialId: primary.id, audiences: apiAudience },
      );
      if (existingProject.status === 404) {
        await json(
          await input.credentials.publishFetch(
            publication,
            projectsBase,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: input.project,
                production_branch: input.productionBranch ?? "main",
              }),
            },
            { credentialId: primary.id, audiences: apiAudience },
          ),
          "Create Cloudflare Pages project",
        );
      } else if (!existingProject.ok) {
        await responseError(existingProject, "Inspect Cloudflare Pages project");
      }
    },
    upload: async () => {
      const jwt = await input.credentials.deriveCredential({
        publication,
        source: {
          url: `${projectBase}/upload-token`,
          method: "GET",
          credentialId: primary.id,
          audiences: apiAudience,
        },
        extract: { jsonPath: ["result", "jwt"] },
        credential: {
          label: `Cloudflare Pages upload: ${input.project}`,
          audience: assetAudience,
          injection: {
            type: "header",
            name: "Authorization",
            valueTemplate: "Bearer {token}",
          },
          expiresInMs: 15 * 60_000,
          metadata: {
            providerId: "cloudflare-pages-upload",
            project: input.project,
          },
        },
      });
      const missing = await json<{ result: string[] }>(
        await input.credentials.publishFetch(
          publication,
          assetUrls[0]!,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashes }),
          },
          { credentialId: jwt.id, audiences: assetAudience },
        ),
        "Check Cloudflare Pages assets",
      );
      const pending = missing.result.map((key) => {
        const file = hashToFile.get(key);
        if (!file)
          throw new Error(`Cloudflare requested an unknown asset: ${key}`);
        return { key, file };
      });
      const batches: (typeof pending)[] = [];
      let batch: typeof pending = [];
      let batchBytes = 0;
      for (const item of pending) {
        if (
          batch.length > 0 &&
          (batchBytes + item.file.bytes.byteLength > 40 * 1024 * 1024 ||
            batch.length >= 2_000)
        ) {
          batches.push(batch);
          batch = [];
          batchBytes = 0;
        }
        batch.push(item);
        batchBytes += item.file.bytes.byteLength;
      }
      if (batch.length > 0) batches.push(batch);
      for (const uploadBatch of batches) {
        const payload = uploadBatch.map(({ key, file }) => ({
          key,
          value: bytesToBase64(file.bytes),
          metadata: { contentType: file.contentType },
          base64: true,
        }));
        await json(
          await input.credentials.publishFetch(
            publication,
            assetUrls[1]!,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
            { credentialId: jwt.id, audiences: assetAudience },
          ),
          "Upload Cloudflare Pages assets",
        );
      }
      await json(
        await input.credentials.publishFetch(
          publication,
          assetUrls[2]!,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashes }),
          },
          { credentialId: jwt.id, audiences: assetAudience },
        ),
        "Commit Cloudflare Pages assets",
      );
    },
    submit: async () => {
      const manifest = Object.fromEntries(
        input.site.files.map((file) => [
          `/${file.path}`,
          cloudflarePagesHash(file),
        ]),
      );
      const form = new FormData();
      form.set("manifest", JSON.stringify(manifest));
      if (input.branch) form.set("branch", input.branch);
      const deployment = await json<{ result: { id: string; url: string } }>(
        await input.credentials.publishFetch(
          publication,
          `${projectBase}/deployments`,
          { method: "POST", body: form },
          { credentialId: primary.id, audiences: apiAudience },
        ),
        "Create Cloudflare Pages deployment",
      );
      return {
        deploymentId: deployment.result.id,
        url: deployment.result.url,
      };
    },
  });
}

/** Files to commit under docs/ before using the existing protected Git publication flow. */
export function githubPagesFiles(
  site: WebsitePackage,
): Array<{ path: string; bytes: Uint8Array }> {
  return site.files.map((file) => ({
    path: `docs/${file.path}`,
    bytes: file.bytes,
  }));
}

export async function verifyPublishedWebsite(
  receipt: PublicationReceipt,
  fetchPublic: (url: string) => Promise<Response> = fetch,
): Promise<VerifiedPublication> {
  if (!receipt.url)
    throw new Error("The publication has no observed public URL");
  const manifestUrl = new URL(
    "vibestudio-build.json",
    receipt.url.endsWith("/") ? receipt.url : `${receipt.url}/`,
  );
  const response = await fetchPublic(manifestUrl.toString());
  const manifest = await json<{ buildId: string }>(
    response,
    "Verify published website",
  );
  if (`sha256:${manifest.buildId}` !== receipt.artifactDigest)
    throw new Error("The public website serves a different build");
  return { ...receipt, verifiedAt: new Date().toISOString() };
}
