import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { canonicalJson } from "@vibestudio/content-addressing";
import {
  templateUpdateCheckSchema,
  type TemplateUpdateStatus,
} from "@vibestudio/service-schemas/templates";
import {
  TEMPLATE_UPDATE_NOTIFICATION_KIND,
  type UserNotification,
} from "@vibestudio/shared/userNotifications";
import {
  templateWorkspaceUpdateAgentPrompt,
  templateUpdateCompatibility,
} from "@workspace/template-management";
import { normalizeTemplateGitUrl } from "@vibestudio/workspace/templateCoordinates";
import { installedSourceDependencies } from "./sourceDependencies";
import type { SemanticWorkspaceObservation } from "./workspace";
import type { ExtensionContextLike } from "./context";

type Check = TemplateUpdateStatus["checks"][number];
const noticeSchema = z.object({
  revision: z.number().int().nonnegative(),
  fingerprint: z.string(),
  notification: z
    .object({
      id: z.string(),
      userId: z.string(),
      kind: z.string(),
      title: z.string(),
      message: z.string(),
      data: z.object({
        prompt: z.string(),
        updates: z.array(templateUpdateCheckSchema),
      }),
      createdAt: z.number(),
      revision: z.number(),
    })
    .nullable(),
  retireIds: z.array(z.string()),
  pending: z.boolean(),
});
type Notice = z.infer<typeof noticeSchema>;

/** Parent actions cover their inherited sources. Every exact target still goes
 * to the agent as data, so dependency constraints remain part of its review. */
export function parentUpdateChecks(
  observation: SemanticWorkspaceObservation,
  checks: Check[],
): Check[] {
  const inherited = installedSourceDependencies(
    observation.manifest,
    checks.map((check) => check.source.url),
    observation.installation,
  );
  return checks.filter(
    (check) => !inherited.has(normalizeTemplateGitUrl(check.source.url)),
  );
}

/** One current workspace notice per member. Revisions are durable occurrences,
 * not version strings; interrupted effects reuse their exact frozen payload. */
export function createTemplateUpdateNotices(ctx: ExtensionContextLike) {
  const directory = path.join(ctx.storage.root, "workspace-update-notices");
  const queues = new Map<string, Promise<unknown>>();
  const filename = (userId: string) =>
    path.join(directory, `${encodeURIComponent(userId)}.json`);
  const read = async (userId: string): Promise<Notice> => {
    try {
      return noticeSchema.parse(
        JSON.parse(await fs.readFile(filename(userId), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return {
      revision: 0,
      fingerprint: "",
      notification: null,
      retireIds: [],
      pending: false,
    };
  };
  const save = async (userId: string, notice: Notice) => {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(`${filename(userId)}.next`, JSON.stringify(notice), {
      mode: 0o600,
    });
    await fs.rename(`${filename(userId)}.next`, filename(userId));
  };
  const serial = async (userId: string, work: () => Promise<void>) => {
    const previous = queues.get(userId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    queues.set(userId, current);
    try {
      await current;
    } finally {
      if (queues.get(userId) === current) queues.delete(userId);
    }
  };
  const deliver = async (userId: string, notice: Notice) => {
    if (!notice.pending) return;
    const service = await ctx.rpc.call<{ kind: string; targetId?: string }>(
      "main",
      "workers.resolveService",
      "vibestudio.gad.workspace.v1",
    );
    if (service.kind !== "durable-object" || !service.targetId)
      throw new Error("Workspace inbox service is unavailable");
    if (notice.notification)
      await ctx.rpc.call(
        service.targetId,
        "putUserNotification",
        notice.notification,
      );
    for (const id of notice.retireIds)
      await ctx.rpc.call(service.targetId, "deleteUserNotification", {
        userId,
        id,
      });
    await save(userId, { ...notice, pending: false, retireIds: [] });
  };
  const update = async (
    userId: string,
    observation: SemanticWorkspaceObservation,
    status: TemplateUpdateStatus,
    checks: Check[],
  ) => {
    const old = await read(userId);
    const fingerprint = checks.length
      ? canonicalJson({
          workspaceAppVersion: status.workspaceAppVersion,
          currentAppVersion: status.currentAppVersion,
          updates: checks
            .map(({ checkedAt: _checkedAt, ...check }) => check)
            .sort((a, b) => a.source.url.localeCompare(b.source.url)),
        })
      : "";
    if (old.fingerprint === fingerprint) return deliver(userId, old);
    const revision = old.revision + 1;
    const roots = parentUpdateChecks(observation, checks);
    const notification: UserNotification | null = checks.length
      ? {
          id: `${TEMPLATE_UPDATE_NOTIFICATION_KIND}:${(await ctx.workspace.getInfo()).id}:${userId}:${revision}`,
          userId,
          kind: TEMPLATE_UPDATE_NOTIFICATION_KIND,
          title: "Workspace template updates",
          message: [
            ...new Set(
              roots.map(
                (check) => templateUpdateCompatibility(check, status).message,
              ),
            ),
          ].join(" "),
          data: {
            prompt: templateWorkspaceUpdateAgentPrompt(roots, checks, status),
            updates: checks,
          },
          createdAt: Date.now(),
          revision,
        }
      : null;
    const notice = noticeSchema.parse({
      revision,
      fingerprint,
      notification,
      retireIds: [
        ...new Set([
          ...old.retireIds,
          ...(old.notification ? [old.notification.id] : []),
        ]),
      ],
      pending: true,
    });
    await save(userId, notice);
    await deliver(userId, notice);
  };
  const membersWithNotices = async () => {
    const files = await fs.readdir(directory).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => decodeURIComponent(file.slice(0, -5)));
  };
  const available = (
    observation: SemanticWorkspaceObservation,
    checks: Check[],
  ) =>
    checks.filter(
      (check) =>
        check.target &&
        check.target.commit !== check.source.commit &&
        check.status !== "error" &&
        observation.templateSources.some(
          (pin) =>
            normalizeTemplateGitUrl(pin.url) ===
              normalizeTemplateGitUrl(check.source.url) &&
            pin.commit === check.source.commit,
        ),
    );
  return {
    async refresh(
      userId: string,
      observation: SemanticWorkspaceObservation,
      status: TemplateUpdateStatus,
    ) {
      await serial(userId, async () => {
        if ((await read(userId)).revision === 0) return;
        await update(
          userId,
          observation,
          status,
          available(observation, status.checks),
        );
      });
    },
    async announce(
      userId: string,
      observation: SemanticWorkspaceObservation,
      status: TemplateUpdateStatus,
    ) {
      await serial(userId, () =>
        update(
          userId,
          observation,
          status,
          available(observation, status.checks),
        ),
      );
    },
    async reconcileInstalled(
      observation: SemanticWorkspaceObservation,
      status: TemplateUpdateStatus,
      ownerUserId?: string,
    ) {
      const failures: unknown[] = [];
      for (const userId of ownerUserId
        ? [ownerUserId]
        : await membersWithNotices()) {
        try {
          await serial(userId, async () => {
            const old = await read(userId);
            const remaining = (old.notification?.data.updates ?? []).filter(
              (check) =>
                observation.templateSources.some(
                  (pin) =>
                    normalizeTemplateGitUrl(pin.url) ===
                      normalizeTemplateGitUrl(check.source.url) &&
                    pin.commit === check.source.commit,
                ),
            );
            await update(userId, observation, status, remaining);
          });
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length)
        throw new AggregateError(failures, failures.map(String).join("; "));
    },
  };
}
