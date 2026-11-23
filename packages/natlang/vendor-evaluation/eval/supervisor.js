import {
  liveLeases,
  readSharedServerAt,
  sharedPaths,
  writeSharedServer
} from "./chunk-chunk-JJ6NRDGL.js";
import "./chunk-chunk-KX6VIJEB.js";

// src/llama/supervisor.ts
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
var specPath = process.argv[2];
if (!specPath) {
  process.stderr.write("usage: supervisor.js SPEC.json\n");
  process.exit(2);
}
var spec = JSON.parse(readFileSync(specPath, "utf8"));
rmSync(specPath, { force: true });
var paths = sharedPaths(spec.directory, spec.key);
var log = openSync(paths.log, "w");
var child = spawn(spec.command, [...spec.args], { stdio: ["ignore", log, log] });
var ready = false;
var stopping = false;
var failedStart = false;
var withdraw = () => {
  if (readSharedServerAt(paths.record)?.pid === process.pid) rmSync(paths.record, { force: true });
};
var stop = (why) => {
  if (stopping) return;
  stopping = true;
  withdraw();
  writeFileSync(log, `natlang supervisor: stopping (${why})
`);
  child.kill("SIGTERM");
  child.kill("SIGINT");
  setTimeout(() => {
    child.kill("SIGKILL");
    process.exit(0);
  }, 5e3).unref();
};
child.once("exit", (code) => {
  withdraw();
  if (stopping && ready && !failedStart && !existsSync(paths.lock) && !existsSync(paths.record)) {
    try {
      rmdirSync(paths.leases);
    } catch {
    }
    for (const path of [paths.log, paths.log.replace(/\.log$/, ".supervisor.log")]) rmSync(path, { force: true });
  }
  if (!ready) {
    let output = "";
    try {
      output = readFileSync(paths.log, "utf8").slice(-4e3);
    } catch {
    }
    writeFileSync(paths.failed, `managed model server exited during startup (code ${code})
${output.trim()}
`);
    rmSync(paths.lock, { force: true });
  }
  process.exit(0);
});
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, () => stop(signal));
async function idle() {
  try {
    const slots = await (await fetch(spec.endpoint + "/slots")).json();
    return !Array.isArray(slots) || slots.every((slot) => !slot.is_processing);
  } catch {
    return false;
  }
}
async function main() {
  const deadline = Date.now() + spec.startTimeoutMs;
  while (!ready) {
    if (stopping) return;
    if (Date.now() > deadline) {
      writeFileSync(paths.failed, `managed model server did not become ready within the startup timeout (see ${paths.log})
`);
      rmSync(paths.lock, { force: true });
      ready = true;
      failedStart = true;
      stop("startup timeout");
      return;
    }
    try {
      if ((await fetch(spec.endpoint + "/health")).ok) ready = true;
    } catch {
    }
    if (!ready) await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  writeSharedServer(spec.directory, {
    schema: "natlang.shared-model-server/2",
    key: spec.key,
    pid: process.pid,
    serverPid: child.pid,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...spec.record
  });
  rmSync(paths.lock, { force: true });
  let unusedSince = Date.now();
  for (; ; ) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 1e3));
    if (stopping) return;
    if (liveLeases(spec.directory, spec.key) > 0 || !await idle()) {
      unusedSince = Date.now();
      continue;
    }
    if (Date.now() - unusedSince >= spec.record.idleSeconds * 1e3) {
      stop(`unused for ${spec.record.idleSeconds} s`);
      return;
    }
  }
}
void main();
