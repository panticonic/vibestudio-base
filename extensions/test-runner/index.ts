import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import {
  nativeTestExecutionSource,
  type NativeTestRunnerReceiver,
  type TestRunRequest,
  type TestRunResult,
} from "@workspace/test-runtime/native";

interface ExtensionContextLike {
  fs: { ensureMaterialized(scope: string | string[] | "all"): Promise<string> };
  rpc: {
    call(
      target: "main",
      method: typeof mainRpcMethods["build.prepareTypecheck"],
      args: [string, string],
    ): Promise<NativeDependencies>;
  };
  invocation: {
    current(): {
      caller: { callerId: string; callerKind?: string; contextId?: string };
      chainCaller?: { contextId?: string };
    } | null;
  };
  log: { info(message: string, fields?: Record<string, unknown>): void };
}

interface NativeDependencies {
  stateHash: string;
  dependencyKey: string | null;
  nodeModulesPaths: string[];
  workspacePackages: Record<string, string>;
}

interface JsonReport {
  numPassedTests?: number;
  numFailedTests?: number;
  numTotalTests?: number;
  testResults?: Array<{
    name: string;
    status: string;
    startTime?: number;
    endTime?: number;
    message?: string;
    assertionResults?: Array<{ failureMessages?: string[] }>;
  }>;
}

const WORKSPACE_ROOTS = new Set([
  "about",
  "clients",
  "extensions",
  "packages",
  "panels",
  "projects",
  "skills",
  "templates",
  "workers",
]);

function assertContextId(value: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value)) {
    throw new Error(`Invalid context ID: ${value}`);
  }
}

function assertTarget(value: string): void {
  const normalized = value.replace(/\\/gu, "/");
  const root = normalized.split("/")[0];
  if (
    !value ||
    path.isAbsolute(value) ||
    normalized.split("/").includes("..") ||
    !root ||
    !WORKSPACE_ROOTS.has(root)
  ) {
    throw new Error(`Target must be a contained workspace unit path: ${value}`);
  }
}

function within(root: string, relative: string): string {
  const resolved = path.resolve(root, relative);
  const remainder = path.relative(root, resolved);
  if (remainder.startsWith("..") || path.isAbsolute(remainder)) {
    throw new Error(`Path escapes test root: ${relative}`);
  }
  return resolved;
}

function declaredNativeSuite(targetPath: string, name: string): string[] {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(targetPath, "package.json"), "utf8"),
  ) as {
    vibestudio?: {
      tests?: Array<{ name?: unknown; runtime?: unknown; include?: unknown }>;
    };
  };
  const suite = pkg.vibestudio?.tests?.find(
    (candidate) => candidate.name === name,
  );
  if (!suite)
    throw new Error(`Unknown declared test suite ${JSON.stringify(name)}`);
  if (suite.runtime !== "native") {
    throw new Error(
      `Native adapter refuses ${String(suite.runtime)} suite ${JSON.stringify(name)}; fallback is forbidden`,
    );
  }
  if (
    !Array.isArray(suite.include) ||
    !suite.include.every((value) => typeof value === "string")
  ) {
    throw new Error(
      `Native suite ${JSON.stringify(name)} has invalid include patterns`,
    );
  }
  return suite.include as string[];
}

function nodeModulesRoot(file: string): string {
  let cursor = path.dirname(file);
  while (path.dirname(cursor) !== cursor) {
    if (path.basename(cursor) === "node_modules") return cursor;
    cursor = path.dirname(cursor);
  }
  throw new Error(`Could not locate dependency root for ${file}`);
}

/** Project only the packages already admitted read-only by the host. */
function linkDependencies(scratch: string, resources: NativeDependencies, vitestNode: string): string[] {
  const dependencies = new Map(Object.entries(resources.workspacePackages));
  dependencies.set("vitest", path.join(nodeModulesRoot(vitestNode), "vitest"));
  for (const root of resources.nodeModulesPaths) {
    for (const name of fs.readdirSync(root)) {
      if (name.startsWith(".")) continue;
      const names = name.startsWith("@")
        ? fs.readdirSync(path.join(root, name)).map(child => `${name}/${child}`)
        : [name];
      for (const specifier of names) {
        const candidate = path.join(root, specifier);
        if (fs.existsSync(path.join(candidate, "package.json")) && !dependencies.has(specifier))
          dependencies.set(specifier, candidate);
      }
    }
  }
  for (const [name, directory] of dependencies) {
    if (!/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_-][A-Za-z0-9_.-]*$/u.test(name))
      throw new Error(`Invalid native test dependency name: ${name}`);
    const link = path.join(scratch, "node_modules", name);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(directory, link, "junction");
  }
  return [...dependencies.keys()];
}

function nativeResolverSource(root: string, resources: NativeDependencies, vitestNode: string, names: string[]): string {
  const directoryUrl = (directory: string) => pathToFileURL(directory + path.sep).href;
  const source = [root, path.dirname(path.dirname(vitestNode)), ...Object.values(resources.workspacePackages)];
  const peers = Object.values(resources.workspacePackages).map(directory => {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    return [directoryUrl(directory), Object.keys(manifest.peerDependencies ?? {})];
  });
  return `
import { registerHooks, isBuiltin } from "node:module";
const sources = ${JSON.stringify(source.map(directoryUrl))};
const workspacePeers = ${JSON.stringify(peers)};
const packages = new Set(${JSON.stringify(names)});
function packageName(id) {
  const [scope, name] = id.split("/");
  return scope.startsWith("@") ? scope + "/" + name : scope;
}
export function admitted(id) {
  return !isBuiltin(id) && packages.has(packageName(id));
}
export function scoped(parent) {
  return sources.some(source => parent?.startsWith(source));
}
export function preferPrepared(id, parent) {
  return parent?.startsWith(sources[0]) || workspacePeers.some(([directory, peers]) =>
    parent?.startsWith(directory) && peers.includes(packageName(id)));
}
registerHooks({
  resolve(id, context, next) {
    const prepared = admitted(id) && scoped(context.parentURL);
    if (prepared && preferPrepared(id, context.parentURL))
      return next(id, { ...context, parentURL: import.meta.url });
    try {
      return next(id, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" && error.code !== "MODULE_NOT_FOUND") throw error;
      if (!prepared) throw error;
      return next(id, { ...context, parentURL: import.meta.url });
    }
  },
});
`;
}

function nativeRunnerSource(input: {
  vitestNodeUrl: string;
  root: string;
  pattern: string;
  include: string[];
  testName?: string;
  reportPath: string;
}): string {
  return `
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startVitest } from ${JSON.stringify(input.vitestNodeUrl)};
import { admitted, preferPrepared, scoped } from "./dependencies.mjs";
const root = ${JSON.stringify(input.root)};
const scratch = path.dirname(${JSON.stringify(input.reportPath)});
const vitest = await startVitest("test", [${JSON.stringify(input.pattern)}], {
  root,
  run: true,
  pool: "threads",
  config: false,
  include: ${JSON.stringify(input.include)},
  exclude: ["**/node_modules/**", "**/dist/**"],
  testNamePattern: ${JSON.stringify(input.testName)},
  passWithNoTests: true,
  reporters: [],
  silent: true,
}, {
  // startVitest's third argument is Vitest options, while cacheDir belongs to
  // the fourth-argument Vite overrides. A materialized workspace is source,
  // not a test-tool workspace, so the adapter's scratch lifetime owns both
  // transform and test-result caches.
  cacheDir: path.join(scratch, "vite-cache"),
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1" },
  plugins: [{
    name: "vibestudio-native-test-dependencies",
    enforce: "pre",
    async resolveId(id, importer, options) {
      if (!importer || !admitted(id)) return null;
      const parent = pathToFileURL(importer).href;
      if (!scoped(parent)) return null;
      if (!preferPrepared(id, parent)) {
        const local = await this.resolve(id, importer, { ...options, skipSelf: true });
        if (local) return local;
      }
      return fileURLToPath(import.meta.resolve(id));
    },
  }],
});
const report = { numPassedTests: 0, numFailedTests: 0, numTotalTests: 0, testResults: [] };
for (const module of vitest.state.getTestModules()) {
    const errors = module.errors().map((error) => error?.stack ?? error?.message ?? String(error));
    let passed = 0;
    let failed = 0;
    for (const test of module.children.allTests()) {
      const result = test.result();
      if (result.state === "passed") passed += 1;
      if (result.state === "failed") {
        failed += 1;
        for (const error of result.errors ?? []) errors.push(test.fullName + ": " + (error?.message ?? String(error)));
      }
    }
    if (module.state() === "failed" && failed === 0) failed = 1;
    report.numPassedTests += passed;
    report.numFailedTests += failed;
    report.numTotalTests += passed + failed;
    const moduleId = module.moduleId.startsWith("file:") ? fileURLToPath(module.moduleId) : module.moduleId;
    report.testResults.push({
      name: moduleId,
      status: module.state() === "failed" ? "failed" : module.state() === "passed" ? "passed" : "skipped",
      startTime: 0,
      endTime: module.diagnostic().duration,
      assertionResults: errors.length ? [{ failureMessages: errors }] : [],
    });
}
fs.writeFileSync(${JSON.stringify(input.reportPath)}, JSON.stringify(report));
const unhandledErrors = vitest.state.getUnhandledErrors();
await vitest.close();
if (unhandledErrors.length > 0) {
  console.error(unhandledErrors);
  process.exitCode = 2;
} else if (report.numFailedTests > 0) process.exitCode = 1;
`;
}

async function runChild(
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid!, "SIGKILL");
    }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 128_000)
        stderr += chunk.toString("utf8", 0, 128_000 - stderr.length);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 128_000)
        stdout += chunk.toString("utf8", 0, 128_000 - stdout.length);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, stdout });
    });
  });
}

export type Api = Awaited<ReturnType<typeof activate>>;

export async function activate(ctx: ExtensionContextLike): Promise<NativeTestRunnerReceiver> {
  ctx.log.info("native test adapter activating");
  return {
    async runNative(request: TestRunRequest): Promise<TestRunResult> {
      assertTarget(request.target);
      const digest = createHash("sha256").update(nativeTestExecutionSource(request)).digest("hex");
      if (!request.stateHash || request.executionDigest !== digest || request.artifactKey !== `native:${digest}`) {
        throw new Error("runNative requires a sealed execution identity");
      }
      const invocation = ctx.invocation.current();
      const callerContext = invocation?.chainCaller?.contextId ?? invocation?.caller.contextId;
      const contextId =
        request.contextId ?? callerContext;
      if (!contextId)
        throw new Error("test-runner.runNative requires a contextId");
      if (callerContext && callerContext !== contextId)
        throw new Error("Native tests must run in the caller's context");
      assertContextId(contextId);
      const root = await ctx.fs.ensureMaterialized(request.target);
      const targetPath = within(root, request.target);
      const suiteIncludes = declaredNativeSuite(targetPath, request.suite);
      if (request.fileFilter) within(targetPath, request.fileFilter);
      const resources = await ctx.rpc.call("main", mainRpcMethods["build.prepareTypecheck"], [request.target, `ctx:${contextId}`]);
      if (resources.stateHash !== request.stateHash)
        throw new Error("The native test plan changed before its dependencies were prepared");

      const scratch = fs.mkdtempSync(
        path.join(os.tmpdir(), "vibestudio-native-tests-"),
      );
      try {
        const reportPath = path.join(scratch, "report.json");
        const runnerPath = path.join(scratch, "runner.mjs");
        const include = suiteIncludes;
        const filePattern = request.fileFilter
          ? within(targetPath, request.fileFilter)
          : targetPath;
        const vitestNode = createRequire(import.meta.url).resolve(
          "vitest/node",
        );
        const dependencies = linkDependencies(scratch, resources, vitestNode);
        const resolverPath = path.join(scratch, "dependencies.mjs");
        fs.writeFileSync(resolverPath, nativeResolverSource(root, resources, vitestNode, dependencies));
        fs.writeFileSync(
          runnerPath,
          nativeRunnerSource({
            vitestNodeUrl: pathToFileURL(vitestNode).href,
            root,
            pattern: filePattern,
            include,
            testName: request.testName,
            reportPath,
          }),
        );
        // The extension and its child execute in the same workspace native
        // domain: MXC resource admission on Unix, normal host-user execution
        // on Windows. Tests are not a separate filesystem security domain.
        // Dependency resolution follows the installed closure, including
        // package-manager links; it does not define another permission list.
        const outcome = await runChild(
          [`--import=${pathToFileURL(resolverPath).href}`, runnerPath],
          root,
          {
            NODE_ENV: "test",
            FORCE_COLOR: "0",
            TMPDIR: scratch,
            TMP: scratch,
            TEMP: scratch,
          },
          120_000,
        );
        if (!fs.existsSync(reportPath)) {
          throw new Error(
            `Native test child exited ${outcome.code ?? "without a code"} without a report${outcome.stderr || outcome.stdout ? `: ${outcome.stderr}${outcome.stdout}` : ""}`,
          );
        }
        const report = JSON.parse(
          fs.readFileSync(reportPath, "utf8"),
        ) as JsonReport;
        const details = (report.testResults ?? []).map((file) => ({
          file: path.relative(root, file.name),
          status:
            file.status === "failed"
              ? ("fail" as const)
              : file.status === "passed"
                ? ("pass" as const)
                : ("skip" as const),
          ...(file.startTime !== undefined && file.endTime !== undefined
            ? { duration: Math.max(0, file.endTime - file.startTime) }
            : {}),
          ...(file.status === "failed"
            ? {
                errors: [
                  ...(file.message ? [file.message] : []),
                  ...(file.assertionResults ?? []).flatMap(
                    (result) => result.failureMessages ?? [],
                  ),
                ].slice(0, 20),
              }
            : {}),
        }));
        const passed = report.numPassedTests ?? 0;
        const failed = report.numFailedTests ?? 0;
        const total = report.numTotalTests ?? passed + failed;
        const status =
          total === 0 ? "no-tests" : failed > 0 ? "failed" : "passed";
        const expectedCode = status === "failed" ? 1 : 0;
        if (outcome.code !== expectedCode) {
          throw new Error(
            `Native test child exited ${outcome.code ?? "without a code"} after producing a ${status} report; verification did not complete${outcome.stderr ? `: ${outcome.stderr}` : ""}`,
          );
        }
        return {
          runtime: "native",
          status,
          artifactKey: request.artifactKey,
          executionDigest: request.executionDigest,
          dependencyKey: resources.dependencyKey,
          summary:
            status === "no-tests"
              ? "No tests matched the execution filter"
              : failed
                ? `${failed} of ${total} tests failed`
                : `${passed} tests passed`,
          passed,
          failed,
          total,
          contextId,
          target: request.target,
          pattern: `${request.suite} (native)`,
          details,
        };
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
      }
    },
  };
}
