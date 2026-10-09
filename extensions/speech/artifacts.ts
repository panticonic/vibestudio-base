import { createHash } from "node:crypto";
import { readFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const engine =
  "https://huggingface.co/Cactus-Compute/needle3/resolve/2ae11323dc000f5e70c49f7403efa6af12ba9e67";
const model =
  "https://huggingface.co/Cactus-Compute/whistle/resolve/b358ddadd89b7a713b5aa131f23032d3cca1b251";
export const artifacts = [
  {
    name: "needle.cjs",
    url: `${engine}/wasm/needle.js`,
    sha256: "964681b2a5ec3c4db2f06e45a5b60c8981a7d4ab4cac16ef6bf5b1988657a5f1",
  },
  {
    name: "needle.wasm",
    url: `${engine}/wasm/needle.wasm`,
    sha256: "c43f48e11f302087250d1e406024956781cd2f02595a5e343b3d7ddd5ef707fa",
  },
  {
    name: "whistle.cact",
    url: `${model}/whistle.cact`,
    sha256: "b6e02f048568ac5d01a2042556c658061e699acbc0aa2a1439f52f3d461dffeb",
  },
  {
    name: "engine-LICENSE",
    url: `${engine}/LICENSE`,
    sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  },
  {
    name: "model-LICENSE",
    url: `${model}/LICENSE`,
    sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  },
] as const;
export const artifactId = createHash("sha256")
  .update(JSON.stringify(artifacts))
  .digest("hex");
export function verifyArtifact(bytes: Uint8Array, expected: string): void {
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error("Whistle artifact checksum mismatch");
}

/** A verified immutable generation; incomplete downloads never become executable. */
export async function prepareArtifacts(
  root: string,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<string> {
  const directory = path.join(root, artifactId);
  await mkdir(directory, { recursive: true });
  for (const artifact of artifacts) {
    signal.throwIfAborted();
    const destination = path.join(directory, artifact.name);
    try {
      verifyArtifact(await readFile(destination), artifact.sha256);
      continue;
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        throw error;
    }
    progress(`Downloading Whistle: ${artifact.name}…`);
    const response = await fetch(artifact.url, { signal });
    if (!response.ok)
      throw new Error(
        `Whistle download failed (${response.status}): ${artifact.name}`,
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    signal.throwIfAborted();
    verifyArtifact(bytes, artifact.sha256);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      signal.throwIfAborted();
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return directory;
}
