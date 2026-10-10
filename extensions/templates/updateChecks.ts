import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  templateUpdateStatusSchema,
  type TemplateUpdateStatus,
  type TemplateExactPin,
} from "@vibestudio/service-schemas/templates";
import { appCompatibilityError } from "@vibestudio/workspace-contracts/appCompatibility";
import { createTemplateUpdateNotices } from "./updateNotice";
import type { ExtensionContextLike } from "./context.js";
import { observeWorkspace } from "./workspace.js";

/** Discovery and durable notices share the existing Automations watch owner. */
export function createTemplateUpdateChecks(
  ctx: ExtensionContextLike,
  resolve: (pin: TemplateExactPin) => Promise<TemplateExactPin>,
) {
  const notices = createTemplateUpdateNotices(ctx);
  let inFlight: Promise<TemplateUpdateStatus> | undefined;
  const filename = () =>
    path.join(ctx.storage.root, "upstream-availability.json");
  const read = async () => {
    try {
      return templateUpdateStatusSchema
        .pick({ checks: true })
        .strict()
        .parse(JSON.parse(await fs.readFile(filename(), "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const status = async (): Promise<TemplateUpdateStatus> => {
    const observation = await observeWorkspace(ctx);
    const host = await ctx.workspace.getInfo();
    const cached = await read();
    const result = {
      workspaceEpoch: observation.manifest.top.systemEpoch,
      workspaceAppVersion: host.appVersion,
      currentAppVersion: host.currentAppVersion,
      checks: (cached?.checks ?? []).filter((check) =>
        observation.templateSources.some(
          (pin) =>
            pin.url === check.source.url && pin.commit === check.source.commit,
        ),
      ),
    };
    const userId = ctx.invocation.current()?.caller.userId;
    if (userId) await notices.reconcileInstalled(observation, result, userId);
    return result;
  };
  const discover = (): Promise<TemplateUpdateStatus> => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const observation = await observeWorkspace(ctx);
      const host = await ctx.workspace.getInfo();
      const workspaceEpoch = observation.manifest.top.systemEpoch;
      const checks: TemplateUpdateStatus["checks"] = [];
      for (const source of observation.templateSources) {
        try {
          const target = await resolve(source);
          const requirement =
            target.commit === source.commit
              ? { systemEpoch: workspaceEpoch }
              : await ctx.rpc.call("main", mainRpcMethods["workspaceTemplateSource.readCompatibility"], [target]);
          checks.push({
            source,
            target,
            targetEpoch: requirement.systemEpoch,
            ...(requirement.minimumAppVersion
              ? { targetMinimumAppVersion: requirement.minimumAppVersion }
              : {}),
            ...(requirement.availableAppVersion
              ? { targetAppVersion: requirement.availableAppVersion }
              : {}),
            ...(requirement.hostError
              ? { hostError: requirement.hostError }
              : {}),
            checkedAt: Date.now(),
            status:
              target.commit === source.commit
                ? "current"
                : requirement.systemEpoch !== workspaceEpoch
                  ? "different-epoch"
                  : appCompatibilityError(requirement, host.appVersion)
                    ? "requires-app-update"
                    : "available",
          });
        } catch (error) {
          checks.push({
            source,
            checkedAt: Date.now(),
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const result = {
        workspaceEpoch,
        workspaceAppVersion: host.appVersion,
        currentAppVersion: host.currentAppVersion,
        checks,
      };
      await fs.mkdir(ctx.storage.root, { recursive: true });
      await fs.writeFile(`${filename()}.tmp`, JSON.stringify({ checks }), {
        mode: 0o600,
      });
      await fs.rename(`${filename()}.tmp`, filename());
      ctx.emit("template-updates:changed", result);
      return result;
    })().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
  const check = async (): Promise<TemplateUpdateStatus> => {
    const userId = ctx.invocation.current()?.caller.userId;
    const result = await discover();
    if (userId) {
      const observation = await observeWorkspace(ctx);
      if (result.checks.some((check) => check.status === "error"))
        await notices.reconcileInstalled(observation, result, userId);
      else await notices.refresh(userId, observation, result);
    }
    return result;
  };
  const pendingSignals = new Map<
    string,
    Promise<{ protocol: "automation-signal.v1"; prompt: null }>
  >();
  const signal = async () => {
    const userId = ctx.invocation.current()?.caller.userId;
    if (!userId)
      throw new Error("Update notifications require an authenticated owner");
    const pending = pendingSignals.get(userId);
    if (pending) return pending;
    const work = (async () => {
      const result = await check();
      const observation = await observeWorkspace(ctx);
      const errors = result.checks.filter((item) => item.status === "error");
      if (!errors.length) await notices.announce(userId, observation, result);
      if (errors.length)
        throw new Error(errors.map((item) => item.error).join("; "));
      return { protocol: "automation-signal.v1" as const, prompt: null };
    })().finally(() => {
      pendingSignals.delete(userId);
    });
    pendingSignals.set(userId, work);
    return work;
  };
  const reconcileInstalled = async () => {
    const observation = await observeWorkspace(ctx);
    const host = await ctx.workspace.getInfo();
    await notices.reconcileInstalled(observation, {
      workspaceEpoch: observation.manifest.top.systemEpoch,
      workspaceAppVersion: host.appVersion,
      currentAppVersion: host.currentAppVersion,
      checks: [],
    });
  };
  return { status, check, signal, reconcileInstalled };
}
