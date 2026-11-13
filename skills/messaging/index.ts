/**
 * Messaging helpers for agent eval:
 *
 *   import { resolveAddressee } from "@workspace-skills/messaging";
 *   const who = resolveAddressee("Tell Maria the build passed", await agent.addressees());
 */
export { resolveAddressee } from "./resolve-addressee.js";
export type {
  AddresseeResolution,
  AmbiguousAddressee,
  ResolvedAddressee,
} from "./resolve-addressee.js";
