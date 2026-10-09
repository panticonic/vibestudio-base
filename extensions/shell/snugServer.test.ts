import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { SnugServer } from "./snugServer.js";

describe("SnugServer", () => {
  it.skipIf(process.platform === "win32")("creates the socket directory with private permissions", async () => {
    const server = new SnugServer(makeOps({ ownerOf: () => "owner" }));
    await server.start();
    const { env, token } = await server.envForSession({});
    const socketPath = env["SNUG_SOCK"];
    if (!socketPath) throw new Error("missing SNUG_SOCK");
    expect(Buffer.byteLength(relative(process.cwd(), socketPath))).toBeLessThanOrEqual(
      process.platform === "darwin" ? 103 : 107,
    );
    await waitForStat(socketPath);
    server.register(token, "session");

    await expect(sendSnug(socketPath, ["notify", "ready"])).resolves.toMatchObject({
      ok: true,
    });

    expect((await stat(dirname(socketPath))).mode & 0o777).toBe(0o700);

    await server.unregister("session");
    await waitForMissing(socketPath);
    await server.dispose();
  });

  it.skipIf(process.platform === "win32")(
    "connects from a different CWD when the absolute temp root exceeds sun_path",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "snug-relative-address-"));
      const runtimeHome = join(
        root,
        "isolated-native-runtime-home-with-a-long-owner-coordinate",
        "workspace-private-state-coordinate-that-is-not-an-ipc-address",
      );
      const runtimeTmp = join(runtimeHome, "tmp");
      await mkdir(runtimeTmp, { recursive: true });
      const callerCwd = join(root, "unrelated-shell-working-directory");
      await mkdir(callerCwd, { recursive: true });

      const serverModule = fileURLToPath(new URL("./snugServer.ts", import.meta.url));
      const hostPackage = join(process.cwd(), "package.json");
      const tsxLoader = createRequire(hostPackage).resolve("tsx");
      const ownerProgram = `
        import { SnugServer } from ${JSON.stringify(pathToFileURL(serverModule).href)};
        const server = new SnugServer({
          list: () => [], setMeta: () => {}, getMeta: () => undefined,
          deleteMeta: () => {}, setLabel: () => {}, write: () => {},
          ownerOf: () => "panel:test", openSplit: async () => "unused",
          openUrl: async () => {},
        });
        try {
          await server.start();
          const { env, token } = await server.envForSession({ PATH: process.env.PATH });
          server.register(token, "session");
          process.stdout.write(JSON.stringify(env) + "\\n");
          process.stdin.resume();
          process.stdin.once("end", () => {
            void server.dispose().catch((error) => {
              console.error(error instanceof Error ? error.stack : String(error));
              process.exitCode = 1;
            });
          });
        } catch (error) {
          try { await server.dispose(); } catch (cleanupError) {
            error = new AggregateError([error, cleanupError], "owner cleanup failed", { cause: error });
          }
          console.error(error instanceof Error ? error.stack : String(error));
          process.exitCode = 1;
        }
      `;
      const owner = spawn(
        process.execPath,
        ["--import", tsxLoader, "--input-type=module", "-e", ownerProgram],
        {
          cwd: runtimeHome,
          env: { ...process.env, TMPDIR: runtimeTmp },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const ownerStdin = owner.stdin!;
      const ownerStdout = owner.stdout!;
      const ownerStderr = owner.stderr!;
      let ownerOutput = "";
      let ownerError = "";
      ownerStdout.setEncoding("utf8");
      ownerStderr.setEncoding("utf8");
      ownerStdout.on("data", (chunk) => (ownerOutput += chunk));
      ownerStderr.on("data", (chunk) => (ownerError += chunk));
      const ownerExit = new Promise<number | null>((resolve, reject) => {
        owner.once("error", reject);
        owner.once("close", resolve);
      });
      let runtimeEnv: NodeJS.ProcessEnv | undefined;
      let primaryError: unknown;
      let retirementError: unknown;
      try {
        runtimeEnv = await new Promise<NodeJS.ProcessEnv>((resolve, reject) => {
          let announced = false;
          const onData = () => {
            const newline = ownerOutput.indexOf("\n");
            if (newline < 0) return;
            announced = true;
            ownerStdout.off("data", onData);
            try {
              resolve(JSON.parse(ownerOutput.slice(0, newline)) as NodeJS.ProcessEnv);
            } catch (error) {
              reject(error);
            }
          };
          if (ownerOutput.includes("\n")) onData();
          else ownerStdout.on("data", onData);
          void ownerExit.then((code) => {
            if (!announced)
              reject(new Error(`Snug owner exited ${code} before publishing its endpoint: ${ownerError}`));
          }, reject);
        });

        const socketPath = runtimeEnv["SNUG_SOCK"];
        if (!socketPath) throw new Error("Snug owner omitted SNUG_SOCK");
        expect(Buffer.byteLength(socketPath)).toBeGreaterThan(107);
        expect(Buffer.byteLength(relative(runtimeHome, socketPath))).toBeLessThanOrEqual(
          process.platform === "darwin" ? 103 : 107,
        );

        const result = await runSnugCli(
          callerCwd,
          runtimeEnv,
          ["notify", "--title", "relative socket", "ready"],
        );
        expect(result.stdout).toContain("1337;snug;");
      } catch (error) {
        primaryError = error;
      } finally {
        try {
          ownerStdin.end();
          const exitCode = await ownerExit;
          if (exitCode !== 0)
            retirementError = new Error(
              `Snug owner exited ${exitCode}${ownerError ? `: ${ownerError}` : ""}`,
            );
        } catch (error) {
          retirementError = error;
        }
        try {
          await rm(root, { recursive: true, force: true });
        } catch (cleanupError) {
          retirementError = retirementError
            ? new AggregateError(
                [retirementError, cleanupError],
                "Could not retire the isolated Snug owner fixture",
                { cause: retirementError },
              )
            : cleanupError;
        }
      }
      if (primaryError && retirementError)
        throw new AggregateError(
          [primaryError, retirementError],
          "Snug roundtrip failed and its owner fixture could not be retired",
          { cause: primaryError },
        );
      if (primaryError) throw primaryError;
      if (retirementError) throw retirementError;
    },
  );

  it("discards pending session sockets that never register", async () => {
    const server = new SnugServer(makeOps());
    await server.start();
    const { env, token } = await server.envForSession({});
    const socketPath = env["SNUG_SOCK"];
    if (!socketPath) throw new Error("missing SNUG_SOCK");
    await waitForStat(socketPath);

    await server.discardPending(token);

    await waitForMissing(socketPath);
    await server.dispose();
  });

  it("does not inject a broken Unix-socket transport on Windows v1", async () => {
    const env = { PATH: "existing" };
    const server = new SnugServer(makeOps(), { platform: "win32" });

    await server.start();
    const result = await server.envForSession(env);
    server.register(result.token, "session");
    await server.discardPending(result.token);

    expect(result).toEqual({ env, token: "" });
    await server.dispose();
  });

  it("rejects snug send to sessions owned by another caller", async () => {
    const writes: Array<{ sessionId: string; text: string }> = [];
    const owners = new Map([
      ["source", "panel:a"],
      ["same-owner", "panel:a"],
      ["other-owner", "panel:b"],
    ]);
    const server = new SnugServer({
      list: () => [],
      setMeta: () => {},
      getMeta: () => undefined,
      deleteMeta: () => {},
      setLabel: () => {},
      write: (sessionId, text) => writes.push({ sessionId, text }),
      ownerOf: (sessionId) => owners.get(sessionId),
      openSplit: async () => "unused",
      openUrl: async () => {},
    });
    await server.start();
    const { env, token } = await server.envForSession({});
    const socketPath = env["SNUG_SOCK"];
    if (!socketPath) throw new Error("missing SNUG_SOCK");
    await waitForStat(socketPath);
    server.register(token, "source");

    await expect(sendSnug(socketPath, ["send", "--to", "same-owner", "--text", "hello"])).resolves.toEqual({ ok: true });
    await expect(sendSnug(socketPath, ["send", "--to", "other-owner", "--text", "secret"])).resolves.toMatchObject({
      ok: false,
      error: "EACCES",
    });

    expect(writes).toEqual([{ sessionId: "same-owner", text: "hello" }]);
    await server.dispose();
  });

  it("rate-limits notifications per session", async () => {
    const server = new SnugServer(makeOps({ ownerOf: () => "panel:a" }));
    await server.start();
    const { env, token } = await server.envForSession({});
    const socketPath = env["SNUG_SOCK"];
    if (!socketPath) throw new Error("missing SNUG_SOCK");
    await waitForStat(socketPath);
    server.register(token, "source");

    const responses: unknown[] = [];
    for (let i = 1; i <= 51; i += 1) {
      responses.push(await sendSnug(socketPath, ["notify", `n${i}`]));
    }

    const okResponses = responses.filter((item) => (item as { ok?: unknown }).ok === true);
    expect(okResponses).toHaveLength(50);
    expect(okResponses.every((item) => String((item as { stdout?: unknown }).stdout ?? "").includes("1337;snug"))).toBe(true);
    expect(responses[50]).toMatchObject({
      ok: false,
      error: "snug notify rate limit exceeded",
    });
    await server.dispose();
  });
});

function makeOps(overrides: Partial<ConstructorParameters<typeof SnugServer>[0]> = {}): ConstructorParameters<typeof SnugServer>[0] {
  return {
    list: () => [],
    setMeta: () => {},
    getMeta: () => undefined,
    deleteMeta: () => {},
    setLabel: () => {},
    write: () => {},
    ownerOf: () => undefined,
    openSplit: async () => "unused",
    openUrl: async () => {},
    ...overrides,
  };
}

async function waitForStat(path: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    try {
      await stat(path);
      return;
    } catch {
      await delay(10);
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function waitForMissing(path: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    try {
      await stat(path);
    } catch {
      return;
    }
    await delay(10);
  }
  throw new Error(`timed out waiting for ${path} removal`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendSnug(socketPath: string, argv: string[]): Promise<unknown> {
  const source = `
    const net = require("node:net");
    const path = require("node:path");
    process.chdir(path.dirname(process.env.SNUG_SOCK));
    const socket = net.createConnection(path.basename(process.env.SNUG_SOCK));
    let data = "";
    socket.on("connect", () => socket.write(JSON.stringify({ proto: 1, version: "0.1.0", pid: process.pid, argv: ${JSON.stringify(argv)} }) + "\\n"));
    socket.on("data", chunk => data += chunk.toString("utf8"));
    socket.on("end", () => process.stdout.write(data || "{}"));
    socket.on("error", error => { console.error(error); process.exitCode = 1; });
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", source], {
      cwd: process.cwd(),
      env: { ...process.env, SNUG_SOCK: socketPath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `Snug client exited ${code}`));
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function runSnugCli(
  cwd: string,
  env: NodeJS.ProcessEnv,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("snug", args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `snug exited ${code}`));
      else resolve({ stdout, stderr });
    });
  });
}
