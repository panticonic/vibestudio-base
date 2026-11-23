// src/llama/shared.ts
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
var sharedServersDirectory = (host) => join(host.directories.state, "model-servers");
var sharingEnabled = (environment) => environment.NATLANG_SHARED_SERVER !== "off";
var sharedIdleSeconds = (environment) => {
  const value = Number(environment.NATLANG_SHARED_SERVER_IDLE_S);
  return Number.isFinite(value) && value >= 0 && environment.NATLANG_SHARED_SERVER_IDLE_S !== "" ? value : 300;
};
function sharedServerKey(identity) {
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16);
}
var alive = (pid) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};
var sharedPaths = (directory, key) => ({
  record: join(directory, `${key}.json`),
  lock: join(directory, `${key}.lock`),
  failed: join(directory, `${key}.failed`),
  log: join(directory, `${key}.log`),
  leases: join(directory, `${key}.leases`)
});
function readSharedServerAt(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value.schema === "natlang.shared-model-server/2" ? value : void 0;
  } catch {
    return void 0;
  }
}
function writeSharedServer(directory, record) {
  const path = sharedPaths(directory, record.key).record, temporary = `${path}.${process.pid}.tmp`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n");
  renameSync(temporary, path);
}
function liveLeases(directory, key) {
  const leases = sharedPaths(directory, key).leases;
  let count = 0;
  for (const name of existsSync(leases) ? readdirSync(leases) : []) {
    const pid = Number(name.split("-")[0]);
    if (Number.isSafeInteger(pid) && pid > 0 && alive(pid)) count++;
    else rmSync(join(leases, name), { force: true });
  }
  return count;
}
async function published(host, directory, key) {
  const record = readSharedServerAt(sharedPaths(directory, key).record);
  if (!record || !alive(record.pid)) return void 0;
  try {
    return { server: record, ready: (await host.fetch(record.endpoint + "/health")).ok };
  } catch {
    return { server: record, ready: false };
  }
}
var leaseCounter = 0;
function takeLease(directory, key) {
  const leases = sharedPaths(directory, key).leases;
  mkdirSync(leases, { recursive: true });
  const path = join(leases, `${process.pid}-${++leaseCounter}`);
  writeFileSync(path, "");
  let held = true;
  const release = () => {
    if (held) {
      held = false;
      rmSync(path, { force: true });
      process.removeListener("exit", release);
    }
  };
  process.once("exit", release);
  return release;
}
function tryLock(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const holder = Number(readFileSync(path, "utf8").trim());
      if (Number.isSafeInteger(holder) && holder > 0 && alive(holder)) return false;
      rmSync(path, { force: true });
    }
  }
  return false;
}
async function acquireSharedServer(host, key, spec, options = {}) {
  const directory = sharedServersDirectory(host), paths = sharedPaths(directory, key);
  mkdirSync(directory, { recursive: true });
  const release = takeLease(directory, key);
  let locked = false;
  try {
    let supervisor;
    for (; ; ) {
      options.signal?.throwIfAborted();
      const found = await published(host, directory, key);
      if (found?.ready) return { server: found.server, started: supervisor !== void 0, release };
      if (found) {
      } else if (supervisor === void 0) {
        if (!host.supervise) {
          release();
          return null;
        }
        if (tryLock(paths.lock)) {
          locked = true;
          rmSync(paths.failed, { force: true });
          supervisor = host.supervise(await spec());
          locked = false;
        }
      } else if (existsSync(paths.failed)) {
        throw new Error(readFileSync(paths.failed, "utf8").trim() || "managed model server failed to start");
      } else if (!alive(supervisor) && !existsSync(paths.record)) {
        rmSync(paths.lock, { force: true });
        let output = "";
        try {
          output = readFileSync(paths.log, "utf8").slice(-4e3);
        } catch {
        }
        throw new Error(`managed model server exited during startup
${output.trim()}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    }
  } catch (error) {
    if (locked) rmSync(paths.lock, { force: true });
    release();
    throw error;
  }
}

export {
  sharedServersDirectory,
  sharingEnabled,
  sharedIdleSeconds,
  sharedServerKey,
  sharedPaths,
  readSharedServerAt,
  writeSharedServer,
  liveLeases,
  acquireSharedServer
};
