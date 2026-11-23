import {
  nativeTextOperation
} from "./chunk-chunk-WRUGMGG2.js";
import {
  chatCompletionModelTurn,
  neuraleseServerInfo
} from "./chunk-chunk-Y6L7V2T3.js";

// src/neuralese/text-init.ts
var Captured = class extends Error {
  constructor(body) {
    super("captured");
    this.body = body;
    this.name = "Captured";
  }
  body;
};
async function captureCallRequest(run) {
  const driver = Object.assign(chatCompletionModelTurn(async (body) => {
    throw new Captured(body);
  }), {
    neuralese: true,
    decide: async (request) => {
      throw new Captured({ messages: request.messages });
    }
  });
  try {
    await run(driver);
  } catch (error) {
    let cause = error;
    for (let depth = 0; cause && depth < 8; depth++) {
      if (cause instanceof Captured) return cause.body;
      cause = cause.cause;
    }
    throw error;
  }
  throw new Error("text init: the call finished without a model request");
}
async function initBodyInContext(options) {
  const { endpoint, headers = {}, text, type } = options;
  const server = await neuraleseServerInfo(endpoint, { headers });
  if (!server.native_state?.enabled)
    throw Object.assign(
      new Error("neuralese-native-state-unavailable: text body initialization requires the native state producer"),
      { code: "neuralese-native-state-unavailable" }
    );
  if (!options.store?.putNativeState || !options.store.getNativeState)
    throw Object.assign(
      new Error("neuralese-native-archive-unavailable: contextual native bodies need a native-capable archive"),
      { code: "neuralese-native-archive-unavailable" }
    );
  const client = { endpoint, headers, store: options.store, info: server };
  const placeholder = (await nativeTextOperation(client, "write-text", {
    text,
    type,
    producer: { source_kind: "native-body-placeholder" }
  })).result.id;
  const request = await captureCallRequest((driver) => options.render(placeholder, driver));
  if (!JSON.stringify(request.messages ?? []).includes(placeholder))
    throw new Error("native body init: the rendered call must contain its exact native placeholder occurrence");
  const { result } = await nativeTextOperation(client, "init-body", {
    messages: request.messages,
    tools: request.tools,
    placeholder,
    text,
    type,
    gate: false,
    ...options.placeholderOccurrence === void 0 ? {} : { placeholder_occurrence: options.placeholderOccurrence }
  });
  if (!result.init || result.init.exact !== false || result.init.aligned !== true || result.init.exact_transport !== true || result.init.contextual !== true || result.gate !== null)
    throw new Error("native body init: server must return contextual capture of the actual native call");
  return { id: result.id, init: { ...result.init, source_capture: result.source_capture, source_text_sha256: result.source_text_sha256 }, gate: null, context: "call" };
}

export {
  captureCallRequest,
  initBodyInContext
};
