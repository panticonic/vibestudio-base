import {
  createTendril,
  listDevices,
  type TendrilHandle,
} from "@workspace/tendril/agent";
import type {
  TendrilBuildResult,
  TendrilField,
  TendrilPage,
  TendrilPresentation,
  TendrilRequest,
  TendrilStep,
  TendrilValue,
} from "./workflow/types.js";

type ReadbackExpectation = { field: TendrilField; minRevision: number };

type Assignment = {
  tendril: Parameters<typeof createTendril>[0];
  fields: readonly string[];
  functions: readonly string[];
  readPage: (
    tendril: TendrilHandle,
    slotId: string,
    expected?: ReadbackExpectation,
  ) => Promise<{ build: string; displayed: TendrilField[] }>;
  stageCandidate: (candidate: string) => Promise<void>;
};

function isFieldValue(value: unknown): value is TendrilValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

export function bindLiveTendril(
  request: TendrilRequest,
  assignment: Assignment,
) {
  const { fields, functions } = assignment;
  const mutations = request.steps.filter((step) => step.kind !== "read");
  let nextMutation = 0;
  let handle: TendrilHandle | undefined;
  let presentation: TendrilPresentation | undefined;
  let closed = false;
  let opening = false;
  let activeMutation = false;

  function livePresentation() {
    if (closed || !handle || presentation?.state !== "presented")
      throw new Error("The assigned Tendril has no live presentation");
    return {
      tendril: handle,
      deviceId: presentation.deviceId,
      slotId: presentation.slotId,
    };
  }

  async function inspect(expected?: ReadbackExpectation): Promise<TendrilPage> {
    const { tendril, deviceId, slotId } = livePresentation();
    const page = await assignment.readPage(tendril, slotId, expected);
    const [description, stored] = await Promise.all([
      tendril.describe(),
      tendril.state.get(),
    ]);
    if (
      !description.presentations.some(
        (item) => item.slotId === slotId && item.deviceId === deviceId,
      )
    )
      throw new Error(
        `Tendril readback for ${slotId} did not identify device ${deviceId}: ${JSON.stringify(description.presentations)}`,
      );
    return {
      id: crypto.randomUUID(),
      slotId,
      build: page.build,
      revision: stored.rev,
      stored: fields.flatMap((key) => {
        const value = stored.state[key];
        return isFieldValue(value) ? [{ key, value }] : [];
      }),
      displayed: page.displayed.filter(
        (item) => fields.includes(item.key) && isFieldValue(item.value),
      ),
      exposed: description.functions
        .filter(
          (entry) => entry.slotId === slotId && functions.includes(entry.name),
        )
        .map(({ name }) => name),
    };
  }

  async function mutate<T>(
    match: (step: TendrilStep) => boolean,
    effect: (
      owned: ReturnType<typeof livePresentation>,
      step: TendrilStep,
    ) => Promise<T>,
  ): Promise<T> {
    const owned = livePresentation();
    const step = mutations[nextMutation];
    if (activeMutation || !step || !match(step))
      throw new Error("Tendril effect exceeds the assigned operation order");
    activeMutation = true;
    // A failed effect can already have run. Do not retry it from the model.
    nextMutation++;
    try {
      return await effect(owned, step);
    } finally {
      activeMutation = false;
    }
  }

  async function devices() {
    if (closed) throw new Error("The Tendril assignment is closed");
    return (await listDevices())
      .filter(({ platform }) => request.platforms.includes(platform))
      .map(({ deviceId, platform, online }) => ({
        id: deviceId,
        platform,
        online,
      }));
  }

  return {
    services: {
      tendrilPresentation: {
        devices,
        async present(deviceId: string): Promise<TendrilPresentation> {
          if (closed || opening || handle)
            throw new Error("This assignment presents the Tendril once");
          opening = true;
          try {
            const selected = (await devices()).find(
              (device) => device.id === deviceId,
            );
            if (!selected || (!selected.online && !request.allowPending))
              throw new Error(
                "The device is not available under the assigned presentation policy",
              );
            handle = await createTendril(assignment.tendril);
            const result = await handle.present(deviceId, {
              focus: false,
              alert: "none",
            });
            presentation = { ...result, deviceId };
            return { ...presentation };
          } finally {
            opening = false;
          }
        },
      },
      tendrilPage: {
        inspect: () => inspect(),
        write(field: TendrilField) {
          return mutate(
            (step) =>
              step.kind === "write" &&
              fields.includes(field.key) &&
              step.field.key === field.key &&
              step.field.value === field.value,
            async ({ tendril }) => {
              const { rev } = await tendril.state.apply([
                { op: "set", path: [field.key], value: field.value },
              ]);
              return inspect({ field, minRevision: rev });
            },
          );
        },
        invoke(name: string) {
          return mutate(
            (step) =>
              step.kind === "invoke" &&
              step.name === name &&
              functions.includes(name),
            async ({ tendril, slotId }, step) => {
              if (step.kind !== "invoke")
                throw new Error(
                  "The assigned Tendril step is not a control call",
                );
              const { rev } = await tendril.state.get();
              await tendril.call(name, {}, { slotId });
              return inspect({ field: step.expected, minRevision: rev + 1 });
            },
          );
        },
      },
      tendrilBuild: {
        update(candidate: string): Promise<TendrilBuildResult> {
          return mutate(
            (step) => step.kind === "update" && step.candidate === candidate,
            async ({ tendril, slotId }) => {
              await assignment.stageCandidate(candidate);
              const result = (await tendril.update()).find(
                (row) => row.slotId === slotId,
              );
              if (!result)
                throw new Error(
                  "No build result for the assigned presentation",
                );
              if (result.outcome === "pending-device")
                return { outcome: result.outcome, page: null };
              return {
                outcome: result.outcome === "proven" ? "proven" : "failed",
                page: await inspect(),
              };
            },
          );
        },
        back() {
          return mutate(
            (step) => step.kind === "restore",
            async ({ tendril, slotId }) => {
              await tendril.back(slotId);
              return inspect();
            },
          );
        },
      },
    },
    async close() {
      closed = true;
      await handle?.archive();
    },
  };
}
