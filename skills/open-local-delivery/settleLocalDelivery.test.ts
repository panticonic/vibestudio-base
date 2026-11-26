import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const { transformSync } = createRequire(import.meta.url)("esbuild");
function settlement(completeDelivery: unknown) {
  const load = (file: string): any => {
    const module = { exports: {} as { default: unknown } };
    const { code } = transformSync(readFileSync(file, "utf8"), {
      loader: "ts",
      format: "cjs",
      target: "es2022",
    });
    new Function("require", "module", "exports", code)(
      (id: string) => ({
        __esModule: true,
        default: id.endsWith(".nl")
          ? completeDelivery
          : load(join(dirname(file), id.replace(/\.js$/u, ".ts"))),
      }),
      module,
      module.exports,
    );
    return module.exports.default;
  };
  return load(join(root, "workTowardLocalDelivery/settleLocalDelivery.ts"));
}
const decision = {
  status: "unconfirmed",
  reason: "A requested conditional note needs current delivery evidence.",
  evidence: [],
  sendRoomId: "room",
};
const observed = {
  room: { id: "room", title: "Owned room", maySend: true },
  basis: "native-current-head",
  phrase: "@actual",
  roster: [],
  resolution: { kind: "ref", ref: "@actual", note: "current exact member" },
  prior: null,
};
it("refuses a send for a missing, unauthorized or unresolved observed recipient", async () => {
  const complete = vi.fn(async () => {
      throw Error("No send authorized");
    }),
    run = settlement(complete);
  for (const values of [
    [],
    [{ ...observed, room: { ...observed.room, maySend: false } }],
    [{ ...observed, resolution: null }],
  ])
    expect(
      await run("Send only to the exact current member", values, decision),
    ).toMatchObject({ status: "held", delivery: null });
  expect(complete).not.toHaveBeenCalled();
});
it("preserves the original attempt and reports a foreign recipient readback as unconfirmed", async () => {
  const delivery = {
    attempt: { attemptId: "native-original-attempt", response: "interrupted" },
    readback: { acknowledged: true, roomId: "room", recipientRef: "@other" },
  };
  const complete = vi.fn(async () => delivery),
    run = settlement(complete);
  const value = await run("Send the requested note once", [observed], decision);
  expect(value.status).toBe("unconfirmed");
  expect(value.delivery).toBe(delivery);
  expect(complete).toHaveBeenCalledExactlyOnceWith(
    "Send the requested note once",
    [observed],
    observed,
  );
});
it("uses only a matching acknowledged native recipient/room to report delivery", async () => {
  const delivery = {
    attempt: { attemptId: "native-original-attempt", response: "submitted" },
    readback: { acknowledged: true, roomId: "room", recipientRef: "@actual" },
  };
  const run = settlement(async () => delivery);
  expect(
    await run("Send the requested note", [observed], decision),
  ).toMatchObject({ status: "delivered", delivery });
});
