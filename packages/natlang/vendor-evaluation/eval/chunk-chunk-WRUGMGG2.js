import {
  HttpNeuraleseStore,
  fetchModel,
  nativeStateConsumerFromInfo,
  neuraleseServerInfo,
  requestNativeStateIds,
  restoreNativeArtifacts,
  restoreNativeStates,
  serves
} from "./chunk-chunk-Y6L7V2T3.js";
import {
  archiveNativeArtifactFrom,
  hexDigest,
  nativeCanonicalJson,
  nativeStateBlockMeta,
  validateNativeAdapterStateConsumption
} from "./chunk-chunk-YDKDWV2X.js";

// src/model/native-state-client.ts
async function nativeStateRuntimeOptions(options, settings = {}) {
  const info = options.info ?? await neuraleseServerInfo(options.endpoint, { headers: options.headers });
  const native = info.native_state;
  if (native?.enabled !== true)
    return failure("neuralese-native-state-unavailable", "the server does not declare its shared-state reader identity");
  const dialect = info.dialects?.[0];
  if (typeof dialect !== "string" || !dialect)
    return failure("neuralese-native-state-unavailable", "the server must declare its native value dialect");
  const canWrite = serves(info, "native.text-write");
  if (settings.write !== "available" && !canWrite)
    return failure("neuralese-native-text-write-unavailable", "the server must explicitly advertise native.text-write");
  const port = canWrite ? await nativeStateWritePort({ ...options, info }) : void 0;
  const nativeStateConsumer = nativeStateConsumerFromInfo(info);
  if (!nativeStateConsumer)
    return failure("neuralese-native-state-unavailable", "the server must declare native identity and consumption modes");
  const { grammarCapture } = await import("./chunk-native-operator-OCKIKVA7.js");
  const capture = serves(info, "native.capture") ? serverCapture({ ...options, info }) : native.production ? grammarCapture({ ...options, info }) : void 0;
  const { materializeNativeStateSentinels } = await import("./chunk-neuralese-server-N2QMIRHI.js");
  const prime = serves(info, "native.init-body") ? async (call, placeholder, text, type) => (await nativeTextOperation({ ...options, info }, "init-body", {
    messages: materializeNativeStateSentinels(call.messages),
    tools: call.tools,
    placeholder,
    text,
    type,
    gate: false
  })).meta : void 0;
  return {
    store: options.store,
    dialect,
    nativeStateConsumer,
    ...prime ? { prime } : {},
    nativeStateConsumerForCall: async () => nativeStateConsumerFromInfo(await neuraleseServerInfo(options.endpoint, { headers: options.headers })),
    ...port ? { port } : {},
    ...capture ? { capture } : {}
  };
}
var failure = (code, detail) => {
  throw Object.assign(new Error(`${code}: ${detail}`), { code });
};
async function archiveNativeState(options, id) {
  if (!id.startsWith("nzs1_")) return failure("neuralese-native-source-integrity", "native state archival requires an exact state ID");
  return await archiveNativeArtifactFrom(new HttpNeuraleseStore(options.endpoint, options.headers), options.store, id);
}
async function restoreNativeInputs(options, value) {
  const remote = new HttpNeuraleseStore(options.endpoint, options.headers);
  await restoreNativeStates(remote, options.store, requestNativeStateIds([value]));
}
function validateSource(result, artifact, text, info) {
  if (result.source_text_sha256 !== hexDigest(text) || artifact.metadata.text !== text)
    return failure("neuralese-native-source-integrity", "native writer must preserve the exact supplied source text");
  const source = result.source_capture;
  if (!source || !Array.isArray(source.segments) || !source.policy)
    return failure("neuralese-native-source-integrity", "native writer must return its actual source token, role and import capture");
  for (const name of ["checkpoint_sha256", "tokenizer_fingerprint", "embedding_weight_sha256", "architecture"])
    if (source.policy[name] !== artifact.metadata[name])
      return failure("neuralese-native-source-integrity", `source ${name} differs from the captured artifact`);
  const own = [], roles = [];
  for (const segment of source.segments) {
    if (segment.kind === "tokens") {
      if (!Array.isArray(segment.token_ids) || !Array.isArray(segment.producing) || segment.token_ids.length !== segment.producing.length || segment.token_ids.some((token) => !Number.isSafeInteger(token) || token < 0) || segment.producing.some((role) => typeof role !== "boolean"))
        return failure("neuralese-native-source-integrity", "source token IDs and producing flags disagree");
      for (const token of segment.token_ids) own.push(token);
      for (const role of segment.producing) roles.push(role);
    } else if (segment.kind !== "native_state" || !/^nzs1_[a-z2-7]{52}$/.test(segment.id))
      return failure("neuralese-native-source-integrity", "source capture contains an invalid native import");
  }
  const start = source.payload_start, stop = source.payload_stop;
  const markers = info.native_state.role_marker_ids;
  if (!Array.isArray(markers) || markers.length !== 4 || own[start - 1] !== markers[0] || own[stop] !== markers[1] || roles[start - 1] !== false || roles[stop] !== false)
    return failure("neuralese-native-source-integrity", "native producer must include actual ordinary-role beginning and end markers around its payload");
  const ids = artifact.tensors.token_ids, view = new DataView(ids.data.buffer, ids.data.byteOffset, ids.data.byteLength);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(stop) || start < 0 || stop < start || stop > own.length || stop - start !== ids.shape[0] || roles.slice(start, stop).some((role) => !role) || own.slice(start, stop).some((token, index) => BigInt(token) !== view.getBigInt64(index * 8, true)))
    return failure("neuralese-native-source-integrity", "captured payload tokens do not match the actual producer source span");
}
async function nativeTextOperation(options, operation, body) {
  const info = options.info ?? await neuraleseServerInfo(options.endpoint, { headers: options.headers });
  const capability = operation === "write-text" ? "native.text-write" : operation === "capture" ? "native.capture" : "native.init-body";
  if (!info.native_state?.enabled || !serves(info, capability))
    return failure(`neuralese-${capability.replaceAll(".", "-")}-unavailable`, "use a native server implementing this exact producer operation");
  if (!options.store.putNativeState || !options.store.getNativeState)
    return failure("neuralese-native-archive-unavailable", "configure a native-capable archive before writing typed state");
  await restoreNativeInputs(options, body);
  if (Array.isArray(body.adapters)) {
    const ids = body.adapters.map((entry) => typeof entry === "string" ? entry : entry.id);
    if (ids.some((id) => typeof id !== "string")) return failure("neuralese-native-adapter-invalid", "native adapters require exact coefficient artifact IDs");
    const missing = await restoreNativeArtifacts(new HttpNeuraleseStore(options.endpoint, options.headers), options.store, ids);
    if (missing.length) return failure("neuralese-unknown-native-artifact", `restore native adapter coefficients and bases ${missing.join(", ")}`);
  }
  const response = await fetchModel(`${options.endpoint.replace(/\/$/, "")}/v1/neuralese/native-states/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...options.headers },
    body: JSON.stringify(body)
  });
  if (!response.ok) return failure("neuralese-native-write", `${operation} failed (${response.status}): ${(await response.text()).slice(0, 1e3)}`);
  const result = await response.json();
  if (!/^nzs1_[a-z2-7]{52}$/.test(result.id)) return failure("neuralese-block-integrity", "native writer returned no native content address");
  const artifact = await archiveNativeState(options, result.id);
  const text = operation === "capture" ? result.source_text : body.text;
  if (typeof text !== "string") return failure("neuralese-native-source-integrity", "native writer must return its exact source text");
  validateSource(result, artifact, text, info);
  if (operation !== "init-body" && nativeCanonicalJson(result.source_capture.adapter_binding ?? null) !== nativeCanonicalJson(artifact.metadata.adapter_binding ?? null))
    return failure("neuralese-native-source-integrity", "text writer actor binding differs from its archived state");
  let logicalPosition = 0;
  const explicitSegments = [];
  for (const segment of result.source_capture.segments) {
    if (segment.kind === "tokens") {
      logicalPosition += segment.token_ids.length;
      continue;
    }
    const imported = await archiveNativeState(options, segment.id);
    for (const key of ["checkpoint_sha256", "tokenizer_fingerprint", "embedding_weight_sha256", "architecture"])
      if (segment.native_identity?.[key] !== imported.metadata[key])
        return failure("neuralese-native-source-integrity", `source import ${segment.id} has an invalid ${key} binding`);
    const receipt = segment.adapter_state_consumption;
    if (receipt) {
      if (body.native_state_modes?.[segment.id] !== "same-base-adapter-state")
        return failure("neuralese-native-source-integrity", "adapter-state import was not explicitly requested");
      validateNativeAdapterStateConsumption(receipt, imported, artifact.metadata);
      if (receipt.target_position_start !== logicalPosition)
        return failure("neuralese-native-source-integrity", "adapter-state import position differs from the actual source stream");
      explicitSegments.push({ id: segment.id, receipt });
    } else for (const key of ["checkpoint_sha256", "tokenizer_fingerprint", "embedding_weight_sha256", "architecture"])
      if (segment.native_identity[key] !== result.source_capture.policy[key])
        return failure("neuralese-native-source-integrity", "source import differs from the source policy without an explicit actor receipt");
    logicalPosition += imported.tensors.token_ids.shape[0];
  }
  for (const imported of result.source_capture.imports ?? []) {
    const original = await archiveNativeState(options, imported.id);
    if (imported.mode === "same-base-adapter-state") {
      const receipt = imported.adapter_state_consumption;
      const index = explicitSegments.findIndex((segment) => segment.id === imported.id && nativeCanonicalJson(segment.receipt) === nativeCanonicalJson(receipt));
      if (index < 0 || imported.observed_native_state_id !== imported.id || !receipt)
        return failure("neuralese-native-source-integrity", "adapter-state import must bind its original artifact and exact source-stream receipt");
      validateNativeAdapterStateConsumption(receipt, original, artifact.metadata);
      explicitSegments.splice(index, 1);
      continue;
    }
    if (imported.adapter_state_consumption)
      return failure("neuralese-native-source-integrity", "adapter-state receipt requires its explicit consumption mode");
    if (imported.mode === "best-effort-text-retokenization") {
      if (imported.observed_native_state_id)
        return failure("neuralese-native-source-integrity", "text fallback cannot attest an imported native KV artifact");
      continue;
    }
    if (imported.mode !== "exact-native-state" || !imported.observed_native_state_id)
      return failure("neuralese-native-source-integrity", "native import must retain its exact observed state and actual consumption mode");
    const observed = await archiveNativeState(options, imported.observed_native_state_id);
    if (observed.metadata.schema !== "neuralese.native-state/1" || !result.source_capture.segments.some((segment) => segment.kind === "native_state" && segment.id === imported.observed_native_state_id))
      return failure("neuralese-native-source-integrity", "native import observation is missing from the actual source stream");
    for (const key of ["checkpoint_sha256", "tokenizer_fingerprint", "embedding_weight_sha256", "architecture"])
      if (observed.metadata[key] !== result.source_capture.policy[key])
        return failure("neuralese-native-source-integrity", "native import observation differs from the source policy");
    if (imported.id !== imported.observed_native_state_id)
      return failure("neuralese-native-source-integrity", "exact native import must preserve its original artifact");
  }
  if (explicitSegments.length)
    return failure("neuralese-native-source-integrity", "adapter-state source-stream receipt is missing its import observation");
  return { result, meta: {
    ...nativeStateBlockMeta(artifact),
    ...typeof body.type === "string" ? { type: body.type } : {},
    producer: {
      ...body.producer,
      native_source_capture: result.source_capture,
      source_text_sha256: result.source_text_sha256
    }
  } };
}
function serverCapture(options) {
  return async (call, extra = {}) => {
    if (!(call.prompt?.length || call.promptSegments?.length) || !call.reply?.length)
      return failure("neuralese-native-capture", "native.capture needs the call's exact prompt and sampled reply ids");
    return (await nativeTextOperation(options, "capture", {
      ...call.promptSegments?.length ? { prompt_segments: call.promptSegments } : { prompt_token_ids: call.prompt },
      reply_token_ids: call.reply,
      ...call.select !== void 0 ? { select: call.select } : {},
      ...extra
    })).meta;
  };
}
async function nativeStateWritePort(options) {
  const info = options.info ?? await neuraleseServerInfo(options.endpoint, { headers: options.headers });
  const native = info.native_state;
  if (!native?.enabled || !native.architecture || !serves(info, "native.text-write"))
    return failure("neuralese-native-text-write-unavailable", "configure a native server with forced text producer support");
  const dialect = `native-state/${native.architecture}`;
  return { dialect, forcedText: true, async write(text, extra = {}) {
    return (await nativeTextOperation({ ...options, info }, "write-text", { text, ...extra })).meta;
  } };
}

export {
  nativeStateRuntimeOptions,
  archiveNativeState,
  restoreNativeInputs,
  nativeTextOperation,
  serverCapture,
  nativeStateWritePort
};
