/** Raw panel CDP uses the authorized testkit driver in every confined runtime. */
import type { PanelHandle } from "@workspace/runtime";
import { activeTestContext } from "./run.js";

export interface RawCdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(method: string, listener: (params: unknown) => void): () => void;
  close(): Promise<void>;
}

type SessionRoute = (handle: PanelHandle) => Promise<RawCdpSession | null>;
let driverRoute: SessionRoute | null = null;

export function _registerDriverRoute(route: SessionRoute): void {
  driverRoute = route;
}

async function openRawSession(handle: PanelHandle): Promise<RawCdpSession> {
  if (!driverRoute)
    throw new Error(
      "Raw panel CDP requires the authorized testkit driver; import @workspace/testkit to register it",
    );
  const session = await driverRoute(handle);
  if (!session)
    throw new Error(
      "The authorized testkit driver did not open the requested panel",
    );
  return session;
}

/** Open either panel kind through the same target-authorized driver. */
export async function rawCdpSession(
  handle: PanelHandle,
): Promise<RawCdpSession> {
  const context = activeTestContext();
  return context
    ? context.acquire(
        () => openRawSession(handle),
        (session) => session.close(),
      )
    : openRawSession(handle);
}

/** Internal shared ownership boundary, including primary plus cleanup failures. */
export async function _usingCdpSession<T>(
  session: RawCdpSession,
  fn: (session: RawCdpSession) => Promise<T>,
): Promise<T> {
  let failed = false,
    primary: unknown;
  try {
    return await fn(session);
  } catch (error) {
    failed = true;
    primary = error;
    throw error;
  } finally {
    try {
      await session.close();
    } catch (cleanup) {
      if (failed)
        throw new AggregateError(
          [primary, cleanup],
          "CDP operation and session cleanup failed",
        );
      throw cleanup;
    }
  }
}

/** Run fn with a session whose native release is joined before returning. */
export async function withCdpSession<T>(
  handle: PanelHandle,
  fn: (session: RawCdpSession) => Promise<T>,
): Promise<T> {
  return _usingCdpSession(await rawCdpSession(handle), fn);
}
