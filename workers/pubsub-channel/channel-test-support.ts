/**
 * Test support: a channel on a Dolt cell as the product runs it, and the fork of
 * its cell that `runtime.cloneContext` makes (docs/dolt-redesign.md §6.4).
 */
import { readFileSync } from "node:fs";
import { doltLocalPatterns } from "@vibestudio/durable/dolt";
import { FakeDoltStorage } from "@vibestudio/durable/test-dolt";

/**
 * A fork of the parent's cell, as `runtime.cloneContext` makes it for a Dolt class
 * (docs/dolt-redesign.md §6.4): the whole store taken at the commit that appended
 * event `through` (the newest state when absent), with its local tables empty.
 */
export async function clonedChannelFake(
  parent: { fake: FakeDoltStorage },
  through?: number,
): Promise<FakeDoltStorage> {
  if (through === undefined) return parent.fake.fork();
  const entries = parent.fake.dolt.log({ limit: 1_000_000 });
  const at =
    through === 0
      ? entries.find((entry) => entry.message.startsWith("channel: append 1 "))
      : entries.find((entry) =>
          entry.message.startsWith(`channel: append ${through} `),
        );
  if (!at) throw new Error(`no commit appended event ${through}`);
  const hash =
    through === 0 ? parent.fake.dolt.hashOf(`${at.hash}~1`) : at.hash;
  return parent.fake.fork({ at: hash });
}

const channelManifest = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  vibestudio: { durable: { classes: Array<{ doltLocal: string[] }> } };
};
/** The channel's own `doltLocal` declaration, with the framework's, as the deployment applies it. */
export const CHANNEL_DOLT_LOCAL = doltLocalPatterns(
  channelManifest.vibestudio.durable.classes[0]!.doltLocal,
);
export const newChannelFake = (): Promise<FakeDoltStorage> =>
  FakeDoltStorage.create({ doltLocal: CHANNEL_DOLT_LOCAL });
