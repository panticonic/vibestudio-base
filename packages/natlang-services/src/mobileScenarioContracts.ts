import { z } from "zod";

const id = z.string().min(1);

export const mobileInventoryMethods = {
  read: {
    args: z.tuple([]),
    returns: z
      .object({
        workspace: id,
        provider: id.nullable(),
        foreground: z.boolean(),
        tooling: z.boolean(),
        devices: z.array(
          z
            .object({ id, state: z.enum(["ready", "unauthorized", "offline"]) })
            .strict(),
        ),
      })
      .strict(),
  },
} as const;

export const mobilePairingMethods = {
  pair: {
    args: z.tuple([id]),
    returns: z
      .object({
        provider: id,
        workspace: id,
        attachedDevice: id,
        pairedDevice: id,
        install: z.enum(["installed", "already-compatible"]),
      })
      .strict()
      .nullable(),
  },
} as const;

export const mobileWorkspaceMethods = {
  read: {
    args: z.tuple([id]),
    returns: z
      .object({
        pairedDevice: id,
        status: z.enum(["opening", "ready", "failed"]),
        message: z.string(),
      })
      .strict()
      .nullable(),
  },
} as const;

export const mobileDevelopmentMethods = {
  install: {
    args: z.tuple([id]),
    returns: z
      .object({ deviceId: id, packageName: id, reset: z.boolean() })
      .strict()
      .nullable(),
  },
} as const;

export const mobileAppMethods = {
  verify: {
    args: z.tuple([id, id]),
    returns: z
      .object({
        deviceId: id,
        packageName: id,
        installed: z.boolean(),
        bundleActive: z.boolean(),
        rendering: z.boolean(),
        screenshotBytes: z.number().int().nonnegative(),
        issues: z.array(z.string()),
      })
      .strict()
      .nullable(),
  },
} as const;
