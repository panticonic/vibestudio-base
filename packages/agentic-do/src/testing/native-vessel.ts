import { createTestDO } from "@workspace/runtime/worker/test-utils";

/** Probe the actual product schema before exercising the native owner's gate.
 * Tests still enter the production initializer with its trusted descriptor. */
const descriptors = new Map<unknown, Promise<unknown>>();
export async function createNativeVesselTestDO<T>(
  ...args: Parameters<typeof createTestDO<T>>
): ReturnType<typeof createTestDO<T>> {
  const [ctor, env, options] = args;
  let descriptor = descriptors.get(ctor);
  if (!descriptor) {
    descriptor = (async () => {
      const probe = await createTestDO(
        ctor,
        { ...env, VIBESTUDIO_SCHEMA_PROBE: true },
        { initialize: false },
      );
      try {
        const response = await (
          probe.instance as { fetch(request: Request): Promise<Response> }
        ).fetch(
          new Request("http://test/test-key/__vibestudio_schema_descriptor"),
        );
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      } finally {
        probe.db.close();
      }
    })();
    descriptors.set(ctor, descriptor);
  }
  return createTestDO(
    ctor,
    { ...env, VIBESTUDIO_SCHEMA_DESCRIPTOR: await descriptor },
    options,
  );
}
