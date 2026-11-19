import { z } from "zod";

const text = z.string();
const next = text.nullable();
const readiness = z.object({
  state: z.enum([
    "needs-setup",
    "needs-consent",
    "needs-verification",
    "needs-drive-scope",
    "verification-failed",
    "ready",
  ]),
});
const folderRow = z.object({
  id: text,
  name: text,
  mimeType: text,
  modifiedAt: next,
  shortcut: z.boolean(),
});
const permission = z.object({
  id: text,
  principalKind: text,
  principal: next,
  role: text,
  discovery: z.boolean(),
  deleted: z.boolean(),
});
const change = z.object({
  fileId: text,
  removed: z.boolean(),
  name: next,
  time: next,
});

export const googleWorkspaceReadMethods = {
  readiness: { args: z.tuple([]), returns: readiness },
  listFolder: {
    args: z.tuple([text, next]),
    returns: z.object({
      rows: z.array(folderRow),
      next,
      incomplete: z.boolean(),
    }),
  },
  readPermissions: {
    args: z.tuple([text, next]),
    returns: z.object({
      rows: z.array(permission),
      next,
    }),
  },
  readChanges: {
    args: z.tuple([text]),
    returns: z.object({
      rows: z.array(change),
      next,
      checkpoint: next,
    }),
  },
} as const;
