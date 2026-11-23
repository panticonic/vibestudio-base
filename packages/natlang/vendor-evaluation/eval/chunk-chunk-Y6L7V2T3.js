import {
  archiveNativeArtifactFrom,
  decodeNativeState,
  decodeNativeTensorArtifact,
  encodeNativeState,
  encodeNativeTensorArtifact,
  nativeCanonicalJson,
  nativeModelIdentityEqual,
  nativeStateArtifactDependencies,
  nativeStateBlockMeta,
  nativeStateContentId,
  nativeTensorArtifactBlockMeta,
  nativeTensorArtifactContentId,
  nativeTensorArtifactDependencies
} from "./chunk-chunk-YDKDWV2X.js";

// src/runtime/plain-object.ts
function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

// src/native/canonical-data.ts
function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + Array.from(value, canonical).join(",") + "]";
  if (isPlainObject(value))
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  throw new Error("adaptation data must contain only finite JSON values");
}

// src/native/native-protocol.ts
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var integer = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
var codes = /* @__PURE__ */ new Set([
  "neuralese-native-state-open",
  "neuralese-native-state-close",
  "neuralese-native-state-consume-marker",
  "neuralese-native-state-nested"
]);
var keys = [
  "schema",
  "code",
  "message",
  "trigger",
  "sample_index",
  "fed",
  "own_input_count",
  "generated_input_count",
  "max_tokens",
  "stop_token_ids"
].sort();
function nativeProtocolFailure(response) {
  if (!record(response)) return void 0;
  const failure = response.x_natlang_native_failure;
  const capture = response.x_natlang_rl_capture;
  if (failure === void 0) {
    if (record(capture) && (capture.protocol_failure !== void 0 || ["natlang.native-rl-sampling/4", "natlang.native-structural-capture/2"].includes(String(capture.schema))))
      throw new Error("neuralese-native-protocol-integrity: failed capture lacks its typed failed turn");
    return void 0;
  }
  const choice = Array.isArray(response.choices) ? response.choices[0] : void 0;
  const message = record(choice) ? choice.message : void 0;
  if (!record(failure) || canonical(Object.keys(failure).sort()) !== canonical(keys) || failure.schema !== "natlang.native-marker-failure/1" || typeof failure.code !== "string" || !codes.has(failure.code) || typeof failure.message !== "string" || !failure.message.startsWith(String(failure.code) + ": ") || typeof failure.fed !== "boolean" || !integer(failure.own_input_count) || !integer(failure.generated_input_count) || !integer(failure.max_tokens) || failure.max_tokens < 1 || !Array.isArray(failure.stop_token_ids) || !failure.stop_token_ids.length || failure.stop_token_ids.some((value) => !integer(value)) || canonical(failure.stop_token_ids) !== canonical([...new Set(failure.stop_token_ids)].sort((a, b) => Number(a) - Number(b))) || !record(choice) || choice.finish_reason !== "error" || !record(message) || typeof message.content !== "string" || message.tool_calls !== void 0 && (!Array.isArray(message.tool_calls) || message.tool_calls.length !== 0) || !record(capture) || !["natlang.native-rl-sampling/4", "natlang.native-structural-capture/2"].includes(String(capture.schema)) || capture.finish_reason !== "error" || !record(capture.protocol_failure) || canonical(capture.protocol_failure) !== canonical(failure) || !Array.isArray(capture.samples) || !Array.isArray(capture.generated_inputs) || !Array.isArray(capture.prompt) || !record(capture.policy) || ["checkpoint_sha256", "tokenizer_fingerprint", "embedding_weight_sha256", "architecture"].some((key) => typeof capture.policy[key] !== "string") || capture.generated_inputs.length !== failure.generated_input_count)
    throw new Error("neuralese-native-protocol-integrity: malformed native failed-turn receipt");
  const inputs = capture.generated_inputs, samples = capture.samples;
  let prompt = 0;
  for (const segment of capture.prompt) {
    if (!record(segment)) throw new Error("neuralese-native-protocol-integrity: malformed prompt receipt");
    if (segment.kind === "tokens") {
      if (!Array.isArray(segment.token_ids) || segment.token_ids.some((value) => !integer(value)))
        throw new Error("neuralese-native-protocol-integrity: malformed prompt tokens");
      prompt += segment.token_ids.length;
    } else if (segment.kind !== "native_state") throw new Error("neuralese-native-protocol-integrity: unknown prompt segment");
  }
  if (prompt + inputs.length !== failure.own_input_count || inputs.some((value) => !record(value)) || samples.some((value, index) => !record(value) || value.index !== index || !integer(value.token_id) || typeof value.terminal !== "boolean" || value.terminal !== failure.stop_token_ids.includes(value.token_id)) || (failure.trigger === "sample" ? !integer(failure.sample_index) || failure.sample_index !== samples.length - 1 || inputs.some((value) => value.sample_index === failure.sample_index) !== failure.fed : failure.trigger !== "length" || failure.sample_index !== null || failure.fed || failure.code !== "neuralese-native-state-open" || inputs.length < failure.max_tokens))
    throw new Error("neuralese-native-protocol-integrity: failed turn changed its sampled/fed boundary");
  return structuredClone(failure);
}
function nativeProtocolFeedback(failure, templatedWrite = false) {
  if (templatedWrite) return `${failure.code}: The typed native writer already opened a producer span. Write its body, then emit the single dedicated <|/neuralese_produce|> special token before ending the reply. Ordinary text spelling those characters does not close the span. Do not emit an end-of-turn token while the producer span is open.`;
  return `${failure.code}: This reply has an incomplete or misplaced Neuralese delimiter. Rewrite the complete reply. If this function returns Neuralese<T>, return the ordinary value of T directly: plain text for string, or JSON for an object. The runtime writes that value as Neuralese; do not put Neuralese delimiters inside the returned string. Invoke offered tools as actual tool calls, not tool-call markup printed as text. For a producer span embedded elsewhere, close every span before ending the reply.`;
}

// src/native/neuralese.ts
var NEURALESE_OPEN = "<|neuralese|>";
var NEURALESE_CLOSE = "<|/neuralese|>";
var isNativeAdapterRef = (value) => !!value && typeof value === "object" && Object.keys(value).length === 1 && "$nativeAdapter" in value && !!value.$nativeAdapter && /^nnt1_[a-z2-7]{52}$/.test(value.$nativeAdapter.id);
function nativeAdapterRef(id2) {
  if (!/^nnt1_[a-z2-7]{52}$/.test(id2)) throw new RangeError("native adapter references require a named nnt1 artifact ID");
  return Object.freeze({ $nativeAdapter: Object.freeze({ id: id2 }) });
}
var NATIVE_TENSOR_REF_KINDS = /* @__PURE__ */ new Set([
  "parameter-set",
  "parameter-gradient",
  "parameter-update",
  "state-gradient",
  "optimizer-state",
  "adapter-basis",
  "adapter-gradient",
  "derivative-program"
]);
var isNativeTensorRef = (value) => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && "$nativeTensor" in value && !!value.$nativeTensor && Object.keys(value.$nativeTensor).length === 2 && /^nnt1_[a-z2-7]{52}$/.test(value.$nativeTensor.id) && NATIVE_TENSOR_REF_KINDS.has(value.$nativeTensor.kind);
function nativeTensorRef(id2, kind) {
  if (!/^nnt1_[a-z2-7]{52}$/.test(id2) || !NATIVE_TENSOR_REF_KINDS.has(kind))
    throw new RangeError("native tensor references require an nnt1 artifact ID and a non-coefficient tensor kind");
  return Object.freeze({ $nativeTensor: Object.freeze({ id: id2, kind }) });
}
var NATIVE_SENTINEL_OPEN = "\uE002";
var NATIVE_SENTINEL_CLOSE = "\uE003";
var NATIVE_STATE_ID = /^nzs1_[a-z2-7]{52}$/;
var NATIVE_TENSOR_ID = /^nnt1_[a-z2-7]{52}$/;
var TEACHER_TEXT_ID = /^nzt1_[a-z2-7]{52}$/;
function isNativeTensorArtifactId(value) {
  return typeof value === "string" && NATIVE_TENSOR_ID.test(value);
}
var NATIVE_SENTINEL = /(nzs1_[a-z2-7]{52})(!)?(?:@([^]+))?/g;
function isTeacherTextNeuraleseId(value) {
  return typeof value === "string" && TEACHER_TEXT_ID.test(value);
}
function isNativeStateId(value) {
  return typeof value === "string" && NATIVE_STATE_ID.test(value);
}
function nativeStateSentinel(id2, stopGradient = false, sourceOccurrence) {
  if (!isNativeStateId(id2)) throw new TypeError(`not a native-state block ID: ${JSON.stringify(id2)}`);
  if (sourceOccurrence !== void 0 && (typeof sourceOccurrence !== "string" || !sourceOccurrence)) throw new TypeError("native source occurrence must be a nonempty string");
  return `${NATIVE_SENTINEL_OPEN}${id2}${stopGradient ? "!" : ""}${sourceOccurrence ? "@" + encodeURIComponent(sourceOccurrence) : ""}${NATIVE_SENTINEL_CLOSE}`;
}
function localNativeOccurrences(value, known) {
  const visit = (item) => {
    if (typeof item === "string") return item.includes(NATIVE_SENTINEL_OPEN) ? item.replace(NATIVE_SENTINEL, (whole, id2, stop, occurrence) => occurrence !== void 0 && !known(id2, decodeURIComponent(occurrence)) ? nativeStateSentinel(id2, !!stop) : whole) : item;
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== "object") return item;
    const record2 = item;
    if (record2.type === "native_state" && typeof record2.id === "string" && typeof record2.source_occurrence === "string" && !known(record2.id, record2.source_occurrence)) {
      const { source_occurrence: _dropped, ...rest } = record2;
      return rest;
    }
    return Object.fromEntries(Object.entries(record2).map(([key, entry]) => [key, visit(entry)]));
  };
  return visit(value);
}
function nativeStateSentinelIds(text) {
  return [...text.matchAll(NATIVE_SENTINEL)].map((match) => match[1]);
}
function runtimePartsToText(parts) {
  return parts.map((part) => part.type === "text" ? part.text : part.type === "teacher_text" ? neuraleseSentinel(part.id, false, part.source_occurrence) : nativeStateSentinel(part.id, part.stop_gradient, part.source_occurrence)).join("");
}
function runtimeTextToParts(text) {
  const parts = [];
  const markers = [];
  for (const match of text.matchAll(/(nzs1_[a-z2-7]{52})(!)?(?:@([^]+))?/g))
    markers.push({ index: match.index, end: match.index + match[0].length, part: {
      type: "native_state",
      id: match[1],
      ...match[2] ? { stop_gradient: true } : {},
      ...match[3] ? { source_occurrence: decodeURIComponent(match[3]) } : {}
    } });
  for (const match of text.matchAll(/(nzt1_[a-z2-7]{52})(?:@([^]+))?/g))
    markers.push({ index: match.index, end: match.index + match[0].length, part: {
      type: "teacher_text",
      id: match[1],
      ...match[2] ? { source_occurrence: decodeURIComponent(match[2]) } : {}
    } });
  markers.sort((a, b) => a.index - b.index);
  let last = 0;
  for (const marker of markers) {
    if (marker.index < last) continue;
    if (marker.index > last) parts.push({ type: "text", text: text.slice(last, marker.index) });
    parts.push(marker.part);
    last = marker.end;
  }
  if (last < text.length || !parts.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}
function neuraleseRef(type, id2, stopGradient = false, sourceOccurrence, teacherText = false) {
  if (!(isNativeStateId(id2) || teacherText && isTeacherTextNeuraleseId(id2))) throw new TypeError(`not a Neuralese block ID: ${JSON.stringify(id2)}`);
  if (sourceOccurrence !== void 0 && (typeof sourceOccurrence !== "string" || !sourceOccurrence)) throw new TypeError("native source occurrence must be a nonempty string");
  return Object.freeze({ $neuralese: Object.freeze({ type, id: id2, ...stopGradient ? { stop_gradient: true } : {}, ...sourceOccurrence ? { source_occurrence: sourceOccurrence } : {}, ...teacherText ? { teacher_text: true } : {} }) });
}
function isNeuraleseRef(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys2 = Object.keys(value);
  if (keys2.length !== 1 || keys2[0] !== "$neuralese") return false;
  const body = value.$neuralese;
  return !!body && typeof body === "object" && typeof body.type === "string" && (isNativeStateId(body.id) && body.teacher_text === void 0 || isTeacherTextNeuraleseId(body.id) && body.teacher_text === true) && (body.stop_gradient === void 0 || body.stop_gradient === true) && (body.source_occurrence === void 0 || typeof body.source_occurrence === "string" && !!body.source_occurrence) && Object.keys(body).every((key) => key === "type" || key === "id" || key === "stop_gradient" || key === "source_occurrence" || key === "teacher_text");
}
function neuraleseSentinel(id2, stopGradient = false, sourceOccurrence) {
  if (isTeacherTextNeuraleseId(id2)) return `\uE000${id2}${sourceOccurrence ? "@" + encodeURIComponent(sourceOccurrence) : ""}\uE001`;
  if (isNativeTensorArtifactId(id2)) throw new Error("neuralese-native-tensor-as-state: named tensor artifacts are not communication state; use NativeTensor for portable tensor references and NativeAdapter only for coefficient actors");
  return nativeStateSentinel(id2, stopGradient, sourceOccurrence);
}
function neuraleseRefSentinel(ref) {
  return neuraleseSentinel(ref.$neuralese.id, ref.$neuralese.stop_gradient, ref.$neuralese.source_occurrence);
}
function neuraleseDisplayText(ref) {
  return `[${ref.$neuralese.type} value: opaque in code; its content is where it was given to you, so pass it on as is, or write await read(value) for an ordinary copy]`;
}
function soleSentinelUse(text) {
  const match = /^(nzs1_[a-z2-7]{52})(!)?(?:@([^]+))?$/.exec(text);
  if (match) return { id: match[1], ...match[2] ? { stop_gradient: true } : {}, ...match[3] ? { source_occurrence: decodeURIComponent(match[3]) } : {} };
  const teacher = /^(nzt1_[a-z2-7]{52})(?:@([^]+))?$/.exec(text);
  return teacher ? { id: teacher[1], teacher_text: true, ...teacher[2] ? { source_occurrence: decodeURIComponent(teacher[2]) } : {} } : void 0;
}
var hasNeuraleseSentinel = (text) => text.includes(NATIVE_SENTINEL_OPEN) || /nzt1_[a-z2-7]{52}/.test(text);
function textToParts(text) {
  return runtimeTextToParts(text);
}
var isContentParts = (value) => Array.isArray(value) && value.length > 0 && value.every((part) => part && typeof part === "object" && (part.type === "text" && typeof part.text === "string" || part.type === "native_state" && isNativeStateId(part.id) && (part.stop_gradient === void 0 || part.stop_gradient === true) && (part.source_occurrence === void 0 || typeof part.source_occurrence === "string" && !!part.source_occurrence) || part.type === "teacher_text" && isTeacherTextNeuraleseId(part.id) && (part.source_occurrence === void 0 || typeof part.source_occurrence === "string" && !!part.source_occurrence)));
function partsToText(parts) {
  return runtimePartsToText(parts);
}
function nativeLiteralArguments(id2, constant = false, source2) {
  return JSON.stringify(id2) + (source2 ? `, ${constant ? "true" : "undefined"}, ${JSON.stringify(source2)}` : constant ? ", true" : "");
}
function sourceWithLiteralCalls(code) {
  const pattern = /(nzs1_[a-z2-7]{52})(!)?(?:@([^]+))?/g;
  const body = new RegExp("`(?:" + pattern.source + ")`", "g");
  const args = (native, stop, source2) => nativeLiteralArguments(native, !!stop, source2 ? decodeURIComponent(source2) : void 0);
  return code.replace(body, (_, native, stop, source2) => `\`\${__neuralese.body(${args(native, stop, source2)})}\``).replace(pattern, (_, native, stop, source2) => `__neuralese(${args(native, stop, source2)})`);
}
async function writeLiterals(text, port, producer = {}) {
  if (!text.includes(NEURALESE_OPEN)) return { text, parts: [{ type: "text", text }], blocks: [] };
  if (!port) throw new NeuraleseUnsupportedError("the model wrote a Neuralese literal, but this runtime has no Neuralese port");
  let out = "", rest = text;
  const blocks = [];
  const parts = [];
  while (true) {
    const open = rest.indexOf(NEURALESE_OPEN);
    if (open < 0) {
      out += rest;
      if (rest) parts.push({ type: "text", text: rest });
      break;
    }
    const prefix = rest.slice(0, open);
    out += prefix;
    if (prefix) parts.push({ type: "text", text: prefix });
    const body = rest.slice(open + NEURALESE_OPEN.length);
    const close = body.indexOf(NEURALESE_CLOSE);
    const inner = close < 0 ? body : body.slice(0, close);
    const block = await port.write(inner, { producer, truncated: close < 0 });
    if (!isNativeStateId(block.id) && !(isTeacherTextNeuraleseId(block.id) && block.producer?.kind === "teacher-text-emulation"))
      throw new NeuraleseUnsupportedError("the configured write port must return an archived native state or an explicitly enabled teacher-text artifact");
    blocks.push(block);
    out += neuraleseSentinel(block.id);
    parts.push(isTeacherTextNeuraleseId(block.id) ? { type: "teacher_text", id: block.id, ...typeof producer.result_type === "string" ? { value_type: producer.result_type } : {} } : { type: "native_state", id: block.id });
    if (close < 0) break;
    rest = body.slice(close + NEURALESE_CLOSE.length);
  }
  return { text: out, parts, blocks };
}
var NeuraleseUnsupportedError = class extends Error {
  code = "neuralese-unsupported-backend";
  constructor(detail) {
    super(`neuralese-unsupported-backend: ${detail}`);
    this.name = "NeuraleseUnsupportedError";
  }
};
var NO_NEURALESE_WRITER = "this runtime has no Neuralese writer; run it with a Neuralese port (a native-state server, or the literal-text transport of a remote teacher)";
var NeuraleseNoWriterError = class extends NeuraleseUnsupportedError {
  constructor(detail) {
    super(`${detail}: ${NO_NEURALESE_WRITER}`);
    this.name = "NeuraleseNoWriterError";
  }
};
function isNoNeuraleseWriterFault(error) {
  for (let current = error, depth = 0; current && depth < 16; current = current.cause, depth++) {
    if (current instanceof NeuraleseNoWriterError) return true;
    if (current instanceof Error && current.message.includes(NO_NEURALESE_WRITER)) return true;
  }
  return false;
}
var NeuraleseDialectError = class extends Error {
  code = "neuralese-dialect-mismatch";
  constructor(detail) {
    super(`neuralese-dialect-mismatch: ${detail}`);
    this.name = "NeuraleseDialectError";
  }
};
function nativeStateConsumerFromInfo(info) {
  const native = info.native_state;
  if (native?.enabled !== true) return void 0;
  if (typeof native.architecture !== "string" || !native.architecture || ["checkpoint_sha256", "tokenizer_fingerprint", "embedding_weight_sha256"].some((key) => typeof native[key] !== "string" || !/^[0-9a-f]{64}$/.test(native[key])) || native.consumption_modes !== void 0 && (!Array.isArray(native.consumption_modes) || native.consumption_modes.some((mode) => typeof mode !== "string")))
    throw new NeuraleseUnsupportedError("native consumer must declare its model identity and actual state consumption modes");
  if (!Array.isArray(native.consumption_modes)) return void 0;
  return {
    architecture: native.architecture,
    checkpoint_sha256: native.checkpoint_sha256,
    tokenizer_fingerprint: native.tokenizer_fingerprint,
    embedding_weight_sha256: native.embedding_weight_sha256,
    consumption_modes: [...native.consumption_modes]
  };
}
function readerDialect(options) {
  const declared = options?.dialect, port = options?.port?.dialect;
  if (declared !== void 0 && port !== void 0 && declared !== port)
    throw new NeuraleseDialectError(`the runtime declares dialect ${JSON.stringify(declared)}, but its write port writes ${JSON.stringify(port)}; configure a port of the declared dialect, or declare ${JSON.stringify(port)}`);
  return declared ?? port ?? null;
}
function dialectBinding(options) {
  if (!options) return void 0;
  const dialect = readerDialect(options), store = options.store;
  return {
    dialect,
    blockDialect: (id2) => store.peek?.(id2)?.dialect,
    nativeDefaultCompatible: (id2, source2, target) => {
      const consumer = options.nativeStateConsumer;
      if (!isNativeStateId(id2) || !consumer || !source2.startsWith("native-state/")) return false;
      if (target !== `native-state/${consumer.architecture}`) return false;
      return consumer.consumption_modes.includes("best-effort-text-retokenization");
    }
  };
}
var supportsNeuralese = (driver) => typeof driver === "function" && driver.neuralese === true;
var supportsGuidance = (driver) => supportsNeuralese(driver) || typeof driver === "function" && driver.guidance === true;
function encodeMessages(messages) {
  let blocks = 0;
  const encode = (text) => {
    if (!hasNeuraleseSentinel(text)) return text;
    const parts = textToParts(text);
    blocks += parts.filter((part) => part.type !== "text").length;
    return parts;
  };
  const out = messages.map((message) => {
    if (!message || typeof message !== "object") return message;
    const record2 = message;
    let changed;
    if (typeof record2.content === "string" && hasNeuraleseSentinel(record2.content))
      changed = { ...record2, content: encode(record2.content) };
    if (Array.isArray(record2.tool_calls) && record2.tool_calls.some((call) => typeof call?.function?.arguments === "string" && hasNeuraleseSentinel(call.function.arguments)))
      changed = { ...changed ?? record2, tool_calls: record2.tool_calls.map((call) => {
        const fn = call.function;
        return typeof fn?.arguments === "string" && hasNeuraleseSentinel(fn.arguments) ? { ...call, function: { ...fn, arguments: encode(fn.arguments) } } : call;
      }) };
    return changed ?? message;
  });
  return { messages: out, blocks };
}
function expectedValueTypes(expected) {
  if (!expected) return [];
  const type = expected.env.resolve(expected.type);
  if (type.kind === "refined" || type.kind === "untrusted") return expectedValueTypes({ ...expected, type: type.base });
  if (type.kind === "union") return type.members.flatMap((member) => expectedValueTypes({ ...expected, type: member }));
  return [type];
}
function acceptsNativeStateParts(expected) {
  if (!expected) return false;
  const type = expected.env.resolve(expected.type);
  if (type.kind === "refined" || type.kind === "untrusted")
    return acceptsNativeStateParts({ ...expected, type: type.base });
  if (type.kind === "neuralese" || type.kind === "prim" && type.name === "unknown") return true;
  if (type.kind === "union") return type.members.some((member) => acceptsNativeStateParts({ ...expected, type: member }));
  if (type.kind === "list" || type.kind === "dict") return acceptsNativeStateParts({ ...expected, type: type.element });
  return false;
}
function acceptsNativeStateList(expected) {
  return expectedValueTypes(expected).some((type) => type.kind === "list" && acceptsNativeStateParts({ env: expected.env, type: type.element }));
}
function expectedChild(expected, key, container) {
  const candidates = expectedValueTypes(expected).filter((type) => {
    if (type.kind !== "record" || !container || typeof container !== "object") return true;
    return type.fields.every((field) => {
      if (!Object.hasOwn(container, field.name)) return true;
      const discriminants = expectedValueTypes({ env: expected.env, type: field.type });
      return !discriminants.length || !discriminants.every((member) => member.kind === "lit") || discriminants.some((member) => member.kind === "lit" && member.value === container[field.name]);
    });
  });
  const members = candidates.flatMap((type) => type.kind === "record" ? type.fields.filter((field) => field.name === key).map((field) => field.type) : type.kind === "list" || type.kind === "dict" ? [type.element] : []);
  return members.length && expected ? {
    env: expected.env,
    type: members.length === 1 ? members[0] : { kind: "union", members }
  } : void 0;
}
async function decodeTurnValue(value, port, producer, written, expected, nativeStateText) {
  const valueBoundary = producer.marker_context === "return-result" || producer.marker_context === "other-tool-argument";
  if (typeof value === "string") {
    const types2 = expectedValueTypes(expected);
    const explicitlyNeuralese = types2.some((type) => type.kind === "neuralese") && !types2.some((type) => type.kind === "prim" && ["string", "Blob", "unknown"].includes(type.name) || type.kind === "lit" && typeof type.value === "string");
    if (!value.includes(NEURALESE_OPEN) || valueBoundary && !explicitlyNeuralese) return value;
    const { text, parts, blocks } = await writeLiterals(value, port, producer);
    written?.push(...blocks);
    return valueBoundary ? parts : text;
  }
  if (isContentParts(value)) {
    if (!valueBoundary) return decodeTurnValue(partsToText(value), port, producer, written);
    const hasNonText = value.some((part) => part.type !== "text");
    if (!hasNonText) return value.map((part) => part.text).join("");
    const onlyStateReferences = value.length > 0 && value.every((part) => part.type === "native_state" || part.type === "teacher_text");
    if (onlyStateReferences && acceptsNativeStateParts(expected)) {
      if (acceptsNativeStateList(expected))
        return value.map((part) => part.type === "teacher_text" ? neuraleseSentinel(part.id, false, part.source_occurrence) : nativeStateSentinel(part.id, part.stop_gradient, part.source_occurrence));
      return value.map((part) => part.type === "teacher_text" ? neuraleseRef(part.value_type ?? "Neuralese<unknown>", part.id, false, part.source_occurrence, true) : { ...part });
    }
    if (value.some((part) => part.type === "native_state") && expected && nativeStateText) {
      const text = [];
      for (const part of value) {
        if (part.type === "text") text.push(part.text);
        else if (part.type === "native_state") {
          const stored = await nativeStateText(part.id);
          if (stored === void 0) throw new NeuraleseUnsupportedError(
            `native state ${part.id} has no authenticated stored text for the declared ordinary result`
          );
          text.push(stored);
        } else {
          throw new NeuraleseUnsupportedError("native-state text conversion received an unsupported content part");
        }
      }
      return text.join("");
    }
    return value.map((part) => ({ ...part }));
  }
  if (Array.isArray(value)) return Promise.all(value.map((item, index) => decodeTurnValue(item, port, producer, written, expectedChild(expected, String(index), value), nativeStateText)));
  if (value && typeof value === "object") {
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await decodeTurnValue(item, port, producer, written, expectedChild(expected, key, value), nativeStateText)]));
    return Object.fromEntries(entries);
  }
  return value;
}

// src/native/tool-markup.ts
var TOOL_MARKUP = /<tool_call>|<\/tool_call>|<function=|<\/function>|<parameter=|<\/parameter>|<\|tool_call_start\|>|<\|tool_call_end\|>/;
var THINK_CLOSE = "</think>";
var SECOND_THINK_CLOSE = "Your last reply closed its reasoning a second time, so nothing ran; close the reasoning once, then make your tool call and end the reply.";
function secondThinkClose(content, reasoning) {
  if (typeof reasoning === "string" && reasoning.includes(THINK_CLOSE)) return true;
  const opened = /^\s*<think>/.test(content) ? content.indexOf(THINK_CLOSE) : -1;
  return content.includes(THINK_CLOSE, opened < 0 ? 0 : opened + THINK_CLOSE.length);
}

// src/model/native-xml-calls.ts
var OPEN = "<tool_call>";
var CLOSE = "\n</parameter>\n";
var annotation = /* @__PURE__ */ new Set(["description", "title", "default", "examples", "$schema", "deprecated", "readOnly", "writeOnly"]);
function resolveRef(ref, root) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) throw new Error("unsupported schema reference");
  let node = root;
  for (const part of ref.slice(2).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!node || typeof node !== "object" || Array.isArray(node) || !Object.hasOwn(node, key)) throw new Error("unresolved schema reference");
    node = node[key];
  }
  if (typeof node !== "boolean" && (!node || typeof node !== "object" || Array.isArray(node))) throw new Error("invalid schema reference");
  return node;
}
function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const x = a, y = b, keys2 = Object.keys(x);
    return keys2.length === Object.keys(y).length && keys2.every((k) => Object.hasOwn(y, k) && equal(x[k], y[k]));
  }
  return false;
}
function types(schema, root = schema, depth = 0) {
  if (depth > 64) throw new Error("recursive schema reference");
  if (schema.$ref !== void 0) {
    const target = resolveRef(schema.$ref, root);
    if (typeof target === "object") return types(target, root, depth + 1);
    return void 0;
  }
  if (typeof schema.type === "string") return [schema.type];
  if (Array.isArray(schema.type) && schema.type.every((x) => typeof x === "string")) return schema.type;
  for (const name of ["anyOf", "oneOf"]) if (Array.isArray(schema[name])) {
    const parts = schema[name].map((part) => types(part, root, depth + 1));
    return parts.some((x) => x === void 0) ? void 0 : [...new Set(parts.flat())];
  }
  return void 0;
}
function matches(type, value) {
  switch (type) {
    case "null":
      return value === null;
    case "object":
      return !!value && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return false;
  }
}
function renderedJson(value) {
  if (Array.isArray(value)) return "[" + value.map(renderedJson).join(", ") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).map(([k, v]) => JSON.stringify(k) + ": " + renderedJson(v)).join(", ") + "}";
  return JSON.stringify(value);
}
function valueFor(text, schema, root) {
  const kinds = types(schema, root);
  if (kinds?.length === 1 && kinds[0] === "string") return text;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    if (kinds && !kinds.includes("string")) throw new Error("parameter is not declared JSON type");
    return text;
  }
  if (!kinds) return typeof value === "string" ? JSON.stringify(value) === text ? value : text : renderedJson(value) === text ? value : text;
  if (kinds.some((kind) => matches(kind, value)) && (typeof value !== "string" || JSON.stringify(value) === text)) return value;
  if (kinds.includes("string")) return text;
  throw new Error("parameter differs from declared type");
}
function valid(schema, value, root, depth = 0) {
  if (depth > 64) return false;
  if (typeof schema === "boolean") return schema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  const supported = /* @__PURE__ */ new Set(["type", "properties", "required", "additionalProperties", "prefixItems", "items", "enum", "const", "anyOf", "oneOf", "allOf", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems", "$ref", "$defs", "definitions", ...annotation]);
  if (Object.keys(schema).some((k) => !supported.has(k) && !k.startsWith("x-"))) return false;
  if (schema.$ref !== void 0 && !valid(resolveRef(schema.$ref, root), value, root, depth + 1)) return false;
  const kind = schema.type;
  if (kind !== void 0 && !(Array.isArray(kind) ? kind : [kind]).some((t) => typeof t === "string" && matches(t, value))) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((x) => equal(x, value))) return false;
  if ("const" in schema && !equal(schema.const, value)) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((s) => valid(s, value, root, depth + 1))) return false;
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((s) => valid(s, value, root, depth + 1)).length !== 1) return false;
  if (Array.isArray(schema.allOf) && !schema.allOf.every((s) => valid(s, value, root, depth + 1))) return false;
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum || typeof schema.maximum === "number" && value > schema.maximum || typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum || typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) return false;
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && [...value].length < schema.minLength || typeof schema.maxLength === "number" && [...value].length > schema.maxLength) return false;
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) return false;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems || typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (schema.uniqueItems === true && value.some((x, i) => value.slice(0, i).some((y) => equal(x, y)))) return false;
    const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    if (value.some((x, i) => i < prefix.length && !valid(prefix[i], x, root, depth + 1))) return false;
    if (schema.items !== void 0 && !value.every((x, i) => i < prefix.length || valid(schema.items, x, root, depth + 1))) return false;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value, props = schema.properties ?? {};
    if (Array.isArray(schema.required) && schema.required.some((k) => typeof k !== "string" || !(k in obj))) return false;
    for (const [key, item] of Object.entries(obj)) {
      if (Object.hasOwn(props, key)) {
        if (!valid(props[key], item, root, depth + 1)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object" && !valid(schema.additionalProperties, item, root, depth + 1)) return false;
    }
  }
  return true;
}
function parseNativeXmlCalls(text, offered) {
  const byName = new Map(offered.map((tool) => [tool.function.name, tool.function.parameters]));
  if (byName.size !== offered.length) throw new Error("ambiguous offered tool names");
  let at = 0;
  const calls = [];
  const ws = () => {
    while (at < text.length && /[ \t\r\n]/.test(text[at])) at++;
  };
  while (true) {
    ws();
    if (at === text.length) break;
    if (!text.startsWith(OPEN, at)) throw new Error("mixed prose or missing tool frame");
    at += OPEN.length;
    ws();
    const nameMatch = /^<function=([^>\n]+)>\n/.exec(text.slice(at));
    if (!nameMatch) throw new Error("incomplete function frame");
    const name = nameMatch[1];
    at += nameMatch[0].length;
    const schema = byName.get(name);
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("tool not offered or missing schema");
    let argumentSchema = schema;
    for (let depth = 0; argumentSchema.$ref !== void 0; depth++) {
      if (depth > 64) throw new Error("recursive root schema reference");
      const target = resolveRef(argumentSchema.$ref, schema);
      if (typeof target !== "object") throw new Error("tool root reference is not an object schema");
      const { $ref: _ref, ...siblings } = argumentSchema;
      argumentSchema = { ...target, ...siblings };
    }
    const props = argumentSchema.properties ?? {};
    const args = /* @__PURE__ */ Object.create(null);
    for (; ; ) {
      const param = /^<parameter=([^>\n]+)>\n/.exec(text.slice(at));
      if (!param) break;
      const key = param[1];
      at += param[0].length;
      const end = text.indexOf(CLOSE, at);
      if (end < 0 || Object.hasOwn(args, key)) throw new Error("incomplete or duplicate parameter");
      const parameterSchema = Object.hasOwn(props, key) ? props[key] : argumentSchema.additionalProperties;
      if (parameterSchema === false) throw new Error("unknown parameter");
      args[key] = valueFor(text.slice(at, end), parameterSchema && typeof parameterSchema === "object" ? parameterSchema : {}, schema);
      at = end + CLOSE.length;
    }
    const tail = /^<\/function>\s*<\/tool_call>/.exec(text.slice(at));
    if (!tail) throw new Error("incomplete tool frame");
    at += tail[0].length;
    if (!valid(schema, args, schema)) throw new Error("tool arguments violate declared schema");
    calls.push([name, { ...args }]);
  }
  if (!calls.length) throw new Error("no complete tool calls");
  return calls;
}

// src/model/decision-scoring.ts
function promptLogprobRequest(messages, reply, extra = {}, open = false, reasoning) {
  return {
    ...extra,
    messages: [...messages, {
      role: "assistant",
      content: reply,
      ...typeof reasoning === "string" ? { reasoning, reasoning_content: reasoning } : {}
    }],
    add_generation_prompt: false,
    continue_final_message: open,
    prompt_logprobs: 0,
    max_tokens: 1
  };
}
function scoresFromPromptLogprobs(responses) {
  const sequences = responses.map((body) => {
    const rows = body.prompt_logprobs;
    if (!Array.isArray(rows)) throw new Error("decision-unsupported: the server returned no prompt_logprobs");
    const promptTokens2 = body.usage?.prompt_tokens;
    const tokens = rows.map((row) => {
      if (!row || typeof row !== "object") return null;
      const [id2, entry] = Object.entries(row)[0] ?? [];
      return id2 === void 0 || typeof entry?.logprob !== "number" ? null : { id: id2, logprob: entry.logprob };
    });
    return { tokens, promptTokens: typeof promptTokens2 === "number" ? promptTokens2 : void 0 };
  });
  const rowsOf = sequences.map((item) => item.tokens);
  const promptTokens = sequences.every((item) => item.promptTokens !== void 0) ? sequences.reduce((sum, item) => sum + item.promptTokens, 0) : void 0;
  let shared = 0;
  const shortest = Math.min(...rowsOf.map((sequence) => sequence.length));
  while (shared < shortest && rowsOf.every((sequence) => sequence[shared]?.id === rowsOf[0][shared]?.id)) shared++;
  if (responses.length === 1) shared = 0;
  return {
    log_probs: rowsOf.map((sequence) => sequence.slice(shared).reduce((sum, row) => sum + (row?.logprob ?? 0), 0)),
    tokens: rowsOf.map((sequence) => sequence.length - shared),
    ...promptTokens !== void 0 ? { prompt_tokens: promptTokens } : {}
  };
}
function batchScoreItem(item, extra) {
  return {
    ...extra,
    messages: item.messages,
    continuations: item.options,
    ...item.cache_messages ? { cache_messages: item.cache_messages } : {},
    ...item.open_reply ? { open_reply: true } : {},
    ...typeof item.reasoning === "string" ? { reasoning: item.reasoning } : {},
    ...item.adapters?.length ? { adapters: item.adapters } : {},
    ...item.native_state_modes ? { native_state_modes: item.native_state_modes } : {},
    ...item.native_recording ? { native_recording: true } : {}
  };
}
function scoresFromBatchResult(result, item) {
  if (!result || typeof result.error === "string" || !Array.isArray(result.log_probs) || result.log_probs.length !== item.options.length)
    throw new Error(result?.error ?? "batched scoring returned no scores for an item");
  if (item.open_reply === true && result.open_reply !== true)
    throw new Error("decision-open-unsupported: the server scored the replies of a field-by-field decision as closed (open_reply not served)");
  if (typeof item.reasoning === "string" && result.reasoning !== true)
    throw new Error("decision-reasoning-unsupported: the server scored the replies without the reasoning before them (reasoning not served)");
  return {
    log_probs: result.log_probs,
    ...result.tokens ? { tokens: result.tokens } : {},
    ...Number.isSafeInteger(result.prompt_tokens) ? { prompt_tokens: result.prompt_tokens } : {},
    ...result.native_decision_capture ? { native_decision_capture: result.native_decision_capture } : {}
  };
}
async function scoreAll(scorer, items, signal) {
  if (items.length === 1) return [await scorer(items[0], signal)];
  const settled = scorer.scoreMany ? await scorer.scoreMany(items, signal) : await Promise.allSettled(items.map((item) => scorer(item, signal)));
  const failed = settled.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return settled.map((result) => result.value);
}

// src/model/native-xml-policy.ts
var NATIVE_XML_POLICY_SHA256 = "c93dc767e0bb16a415c022ea64b14e93f992f53d88750b5bdcc8dbcee765651f";

// src/model/chat-completion.ts
function providerErrorBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return void 0;
  const root = body, nested = root.error;
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested : root;
}
function secondThinkCloseSetting(options) {
  const configured = options.secondThinkClose ?? globalThis.process?.env?.NATLANG_SECOND_THINK_CLOSE;
  if (configured === void 0 || configured === "" || configured === "error") return "error";
  if (configured === "content") return "content";
  throw new RangeError(`NATLANG_SECOND_THINK_CLOSE must be error or content, not ${JSON.stringify(configured)}`);
}
var LeakedCall = class extends Error {
};
function callWrittenAsText(text, tools) {
  const body = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/, "$1").trim();
  if (!body.startsWith("{")) return void 0;
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return void 0;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const keys2 = Object.keys(value);
  const matches2 = tools.filter((tool) => {
    const parameters = tool.function.parameters;
    const properties = Object.keys(parameters?.properties ?? {});
    return keys2.length > 0 && keys2.every((key) => properties.includes(key)) && (parameters?.required ?? []).every((key) => keys2.includes(key));
  });
  return matches2.length === 1 ? [matches2[0].function.name, value] : void 0;
}
var MALFORMED_RETRY = "The last tool call was malformed. Call one offered tool with valid JSON object arguments. Do not change the task or invent a new tool.";
function leakedCallFeedback(text, tools) {
  const at = text.indexOf("<tool_call>");
  let problem = "could not be read";
  if (at >= 0) try {
    parseNativeXmlCalls(text.slice(at), tools);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    problem = /function frame/.test(message) ? "did not name its function on the line after the opening tag" : /not offered/.test(message) ? "named a tool this call does not offer" : /duplicate parameter/.test(message) ? "left a parameter open or gave one twice" : /unknown parameter/.test(message) ? "gave a parameter its tool does not have" : /incomplete tool frame/.test(message) ? "was not closed after its last parameter" : /mixed prose/.test(message) ? "was followed by text that is not a call" : /declared|schema/.test(message) ? "gave an argument that is not of its declared type" : problem;
  }
  return `The tool call in your last reply ${problem}, so nothing ran; send the call again, complete.`;
}
var TOOL_CALL_FIELDS = /* @__PURE__ */ new Set(["index", "id", "type", "function"]);
function isStream(value) {
  return typeof value[Symbol.asyncIterator] === "function";
}
async function assembleChatCompletion(chunks, onDelta) {
  let head = {}, finish = null, reasoning = "", sawContent = false, sawReasoning = false;
  let final;
  const parts = [];
  let partsOnly = true;
  const calls = [];
  const extra = {};
  const emit = (delta) => {
    try {
      onDelta?.(delta);
    } catch {
    }
  };
  const addText = (text) => {
    const last = parts[parts.length - 1];
    if (last?.type === "text") last.text += text;
    else parts.push({ type: "text", text });
    if (text) emit({ type: "text", text });
  };
  const blockFor = (chunk, id2) => {
    for (const key of ["native_state"]) {
      const block = chunk[key]?.block;
      if (block?.id === id2) return block;
    }
    return void 0;
  };
  for await (const chunk of chunks) {
    if (!Object.keys(head).length) head = { id: chunk.id, model: chunk.model, created: chunk.created };
    for (const key of ["usage", "timings", "system_fingerprint"]) if (chunk[key] != null) extra[key] = chunk[key];
    if (chunk.x_natlang_message && typeof chunk.x_natlang_message === "object") {
      final = chunk.x_natlang_message;
      for (const [key, value] of Object.entries(chunk))
        if (!["id", "object", "created", "model", "choices", "x_natlang_message"].includes(key)) extra[key] = value;
    }
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason != null) finish = choice.finish_reason;
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string") {
      addText(delta.content);
      sawContent = true;
    } else if (Array.isArray(delta.content)) {
      sawContent = true;
      partsOnly = false;
      for (const part of delta.content) {
        if (part?.type === "text") addText(part.text);
        else if (part?.type === "native_state") {
          parts.push({ ...part });
          const block = blockFor(chunk, part.id);
          emit({ type: "native_state", part: { ...part }, ...block ? { block } : {} });
        }
      }
    }
    const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoningDelta === "string") {
      reasoning += reasoningDelta;
      sawReasoning = true;
      if (reasoningDelta) emit({ type: "reasoning", text: reasoningDelta });
    }
    for (const part of delta.tool_calls ?? []) {
      const index = typeof part.index === "number" ? part.index : calls.length;
      const call = calls[index] ??= { type: "function", function: { name: "", arguments: "" } };
      if (typeof part.id === "string") call.id = part.id;
      if (typeof part.type === "string") call.type = part.type;
      const fn = part.function ?? {};
      if (typeof fn.name === "string") call.function.name += fn.name;
      if (typeof fn.arguments === "string") call.function.arguments += fn.arguments;
      for (const [key, value] of Object.entries(part)) if (!TOOL_CALL_FIELDS.has(key)) call[key] = value;
      const fragment = {
        ...typeof part.id === "string" ? { id: part.id } : {},
        ...typeof fn.name === "string" && fn.name ? { name: fn.name } : {},
        ...typeof fn.arguments === "string" && fn.arguments ? { arguments: fn.arguments } : {}
      };
      if (Object.keys(fragment).length) emit({ type: "tool_call", index, ...fragment });
    }
  }
  const content = !sawContent ? null : partsOnly ? parts.map((part) => part.text).join("") : parts;
  const message = final ? structuredClone(final) : {
    role: "assistant",
    content,
    ...sawReasoning ? { reasoning_content: reasoning } : {},
    ...calls.length ? { tool_calls: calls.filter(Boolean) } : {}
  };
  return { ...head, object: "chat.completion", choices: [{ index: 0, message, finish_reason: finish }], ...extra };
}
function contentText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((part) => part && typeof part === "object" && (part.type === "text" && typeof part.text === "string" || part.type === "native_state" && typeof part.id === "string")))
    return runtimePartsToText(value);
  if (value == null) return "";
  throw new Error("model content contains unsupported structured parts");
}
function publicSchema(value) {
  if (Array.isArray(value)) return value.map(publicSchema);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("x-natlang") && key !== "x-optional").map(([key, item]) => [key, publicSchema(item)]));
  return value;
}
function modelTools(rawTools) {
  return rawTools.map((raw, index) => {
    const tool = raw;
    if (tool?.type !== "function" || typeof tool.function?.name !== "string") throw new TypeError(`model tool ${index} is invalid`);
    return publicSchema(tool);
  });
}
function decodeArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") throw new Error("tool arguments are neither JSON text nor an object");
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("tool arguments must be an object");
  return parsed;
}
function chatCompletionModelTurn(transport, options = {}) {
  const forward = options.toolAliases ?? {};
  const reverse = Object.fromEntries(Object.entries(forward).map(([source2, target]) => [target, source2]));
  const rejectSecondClose = secondThinkCloseSetting(options) === "error";
  return async (request, signal, turnOptions = {}) => {
    const observer = turnOptions.onDelta;
    let emitted = false;
    const onDelta = observer && ((delta) => {
      emitted = true;
      try {
        observer(delta.type === "tool_call" && delta.name ? { ...delta, name: reverse[delta.name] ?? delta.name } : delta);
      } catch {
      }
    });
    const recordedRequest = options.onExchange ? structuredClone(request) : void 0;
    const tools = modelTools(request.tools);
    for (const tool of tools) tool.function.name = forward[tool.function.name] ?? tool.function.name;
    const responseTools = request.response_tools ? modelTools(request.response_tools) : void 0;
    if (responseTools && tools.length) throw new Error("out-of-band response tools require an empty prompt tool list");
    for (const tool of responseTools ?? []) tool.function.name = forward[tool.function.name] ?? tool.function.name;
    const messages = structuredClone(request.messages);
    const hostCallFields = options.request?.x_natlang_host_call_fields;
    for (const message of messages) {
      if (hostCallFields && message.natlang_host_generated)
        for (const call of message.tool_calls ?? []) Object.assign(call, structuredClone(hostCallFields));
      delete message.natlang_host_generated;
    }
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      const legacy = message.reasoning_content, current = message.reasoning;
      if (typeof legacy === "string" && typeof current === "string" && legacy !== current)
        throw new Error("conflicting reasoning history aliases");
      const reasoning = typeof legacy === "string" ? legacy : current;
      if (typeof reasoning === "string") message.reasoning = message.reasoning_content = reasoning;
    }
    for (const message of messages) for (const call of message.tool_calls ?? [])
      if (call.function?.name && forward[call.function.name]) call.function.name = forward[call.function.name];
    const continued = request.continue;
    if (continued && !options.continuesReplies)
      throw new Error("continuation-unsupported: this model backend cannot continue a cut-off reply");
    let attemptMessages = continued ? [...messages, {
      role: "assistant",
      content: continued.text,
      ...continued.reasoning ? { reasoning: continued.reasoning, reasoning_content: continued.reasoning } : {}
    }] : messages;
    let retries = 0;
    let promptTokens = 0, completionTokens = 0, cachedTokens = 0, prefillMs = 0, generationMs = 0;
    let hasPrompt = false, hasCompletion = false, hasCached = false, hasTimings = false;
    const started = Date.now();
    const counts = () => ({
      ...hasCompletion ? { completion_tokens: completionTokens } : {},
      ...hasPrompt ? { prompt_tokens: promptTokens } : {}
    });
    let scheduling;
    const finish = (turn) => {
      options.onTurn?.({
        durationMs: Date.now() - started,
        promptTokens: hasPrompt ? promptTokens : null,
        completionTokens: hasCompletion ? completionTokens : null,
        cachedTokens: hasCached ? cachedTokens : null,
        retries,
        ...scheduling ? { scheduling } : {}
      });
      const counted = {
        ...turn,
        ...hasCached ? { cached_tokens: cachedTokens } : {},
        ...hasTimings ? { prefill_ms: Math.round(prefillMs), generation_ms: Math.round(generationMs) } : {}
      };
      return scheduling ? { ...counted, scheduling } : counted;
    };
    while (true) {
      if (signal?.aborted) throw new Error("model turn aborted");
      const wireRequest = {
        ...options.request,
        messages: attemptMessages,
        ...tools.length ? { tools, tool_choice: request.tool_choice ?? "auto" } : {},
        ...continued && !retries ? { stream: false } : {}
      };
      if (!tools.length) {
        delete wireRequest.tools;
        delete wireRequest.tool_choice;
      }
      if (request.temperature !== void 0) wireRequest.temperature = request.temperature;
      if (request.adapters?.length) {
        if (!options.adapters) throw Object.assign(
          new Error("neuralese-native-adapters-unavailable: this call binds weight adapters, which only a native-state model server applies; call it through that server"),
          { code: "neuralese-native-adapters-unavailable" }
        );
        wireRequest.x_natlang_adapters = request.adapters;
      }
      if (request.guidance) wireRequest.guidance = request.guidance;
      if (request.privileged_context || request.guidance_policy) {
        if (!options.adapters) throw Object.assign(new Error("training-guidance-unavailable: training guidance runs on a native-state model server; collect this run through that server"), { code: "training-guidance-unavailable" });
        if (request.privileged_context) wireRequest.x_natlang_privileged_context = request.privileged_context;
        if (request.guidance_policy) wireRequest.x_natlang_guidance_policy = request.guidance_policy;
      }
      if (request.native_teacher_forced_turn) {
        wireRequest.x_natlang_forced_message = request.native_teacher_forced_turn;
        wireRequest.x_natlang_native_recording = true;
      }
      if (request.template) {
        const template = request.template;
        wireRequest.neuralese_template = { ...template, call: forward[template.call] ?? template.call };
      }
      const omitSeed = wireRequest.x_natlang_omit_seed === true;
      delete wireRequest.x_natlang_omit_seed;
      delete wireRequest.x_natlang_host_call_fields;
      if (request.seed !== null && !omitSeed) wireRequest.seed = request.seed;
      const configuredMax = options.request?.max_tokens;
      if (configuredMax !== void 0 && (typeof configuredMax !== "number" || !Number.isSafeInteger(configuredMax) || configuredMax < 1))
        throw new Error("configured max_tokens must be a positive integer");
      if (request.max_tokens != null)
        wireRequest.max_tokens = typeof configuredMax === "number" ? Math.min(configuredMax, request.max_tokens) : request.max_tokens;
      await options.onRequestStart?.(request, retries);
      if (onDelta && emitted) {
        onDelta({ type: "reset" });
        emitted = false;
      }
      const reply = await transport(wireRequest, signal, {
        ...request.invocation_id ? { invocation_id: request.invocation_id } : {},
        ...request.decision_reasoning ? { decision_reasoning: { ...request.decision_reasoning } } : {},
        retry: retries,
        onScheduled: (info) => {
          scheduling = { ...info, queue_wait_ms: (scheduling?.queue_wait_ms ?? 0) + info.queue_wait_ms };
        },
        ...onDelta ? { onDelta } : {}
      });
      const body = isStream(reply) ? await assembleChatCompletion(reply, onDelta) : reply;
      if (options.onExchange) await options.onExchange(structuredClone({ request: recordedRequest, wireRequest, wireResponse: body }));
      const choice = body.choices?.[0];
      const message = choice?.message;
      const rawCalls = message?.tool_calls;
      const usage = body.usage;
      if (typeof usage?.prompt_tokens === "number") {
        promptTokens += usage.prompt_tokens;
        hasPrompt = true;
      }
      if (typeof usage?.completion_tokens === "number") {
        completionTokens += usage.completion_tokens;
        hasCompletion = true;
      }
      const cached = usage?.prompt_tokens_details?.cached_tokens ?? body.timings?.cache_n;
      if (typeof cached === "number") {
        cachedTokens += cached;
        hasCached = true;
      }
      const timings = body.timings;
      if (typeof timings?.prompt_ms === "number" && typeof timings.predicted_ms === "number") {
        prefillMs += timings.prompt_ms;
        generationMs += timings.predicted_ms;
        hasTimings = true;
      }
      const truncated = choice?.finish_reason === "length";
      if (continued && !retries) {
        const text = contentText(message?.content), reasoning = message?.reasoning_content ?? message?.reasoning;
        const thought = typeof reasoning === "string" ? reasoning : "";
        if (!text.startsWith(continued.text) || !thought.startsWith(continued.reasoning ?? ""))
          throw new Error("continuation-mismatch: the server did not answer with the whole continued reply");
        if (onDelta) {
          if (thought.length > (continued.reasoning ?? "").length) onDelta({ type: "reasoning", text: thought.slice((continued.reasoning ?? "").length) });
          if (text.length > continued.text.length) onDelta({ type: "text", text: text.slice(continued.text.length) });
        }
      }
      const protocolFailure = nativeProtocolFailure(body);
      if (protocolFailure) return finish({
        calls: [],
        text: contentText(message?.content),
        protocol_failure: protocolFailure,
        ...counts(),
        raw_response: body
      });
      if (rejectSecondClose && !truncated) {
        const reasoning = message?.reasoning_content ?? message?.reasoning;
        if (secondThinkClose(contentText(message?.content), reasoning))
          return finish({
            calls: [],
            text: contentText(message?.content),
            malformed_call: SECOND_THINK_CLOSE,
            ...rawCalls?.length ? { raw_calls: rawCalls } : {},
            ...typeof reasoning === "string" && reasoning.trim() ? { reasoning } : {},
            ...counts(),
            raw_response: body
          });
      }
      try {
        const calls = (rawCalls ?? []).map((raw, index) => {
          const fn = raw.function;
          const wireName = String(fn?.name ?? "");
          if (!wireName) throw new Error(`tool call ${index} has no function name`);
          return [reverse[wireName] ?? wireName, decodeArguments(fn?.arguments)];
        });
        const replyText = contentText(message?.content);
        let parsedNative = false;
        if (!calls.length && TOOL_MARKUP.test(replyText)) {
          if (responseTools && !truncated) {
            try {
              calls.push(...parseNativeXmlCalls(replyText, responseTools).map(([name, args]) => [reverse[name] ?? name, args]));
              parsedNative = true;
            } catch {
              throw new LeakedCall(leakedCallFeedback(replyText, responseTools));
            }
          } else throw new LeakedCall(leakedCallFeedback(replyText, tools));
        }
        const written = calls.length ? void 0 : callWrittenAsText(replyText, tools);
        if (written) calls.push([reverse[written[0]] ?? written[0], written[1]]);
        const reasoning = message?.reasoning_content ?? message?.reasoning;
        return finish({
          calls,
          text: parsedNative ? "" : replyText,
          raw_calls: rawCalls,
          ...parsedNative ? { tool_parse: { schema: "natlang.native-xml-tool-parse/1", source: "assistant-content", schema_custody: "response_tools", policy_sha256: NATIVE_XML_POLICY_SHA256, wire_tool_aliases: structuredClone(forward) } } : {},
          ...typeof reasoning === "string" && reasoning.trim() ? { reasoning } : {},
          ...truncated ? { truncated: true } : {},
          ...counts(),
          raw_response: body
        });
      } catch (error) {
        if (truncated) {
          const reasoning = message?.reasoning_content ?? message?.reasoning;
          return finish({
            calls: [],
            text: contentText(message?.content),
            truncated: true,
            raw_calls: rawCalls,
            ...typeof reasoning === "string" && reasoning.trim() ? { reasoning } : {},
            ...counts(),
            raw_response: body
          });
        }
        if (error instanceof LeakedCall) {
          const reasoning = message?.reasoning_content ?? message?.reasoning;
          return finish({
            calls: [],
            text: contentText(message?.content),
            malformed_call: error.message,
            ...typeof reasoning === "string" && reasoning.trim() ? { reasoning } : {},
            ...counts(),
            raw_response: body
          });
        }
        if (retries >= 1 || signal?.aborted)
          throw new Error(`model returned malformed tool arguments after ${retries + 1} attempt${retries ? "s" : ""}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        retries++;
        attemptMessages = [
          ...messages,
          { role: "assistant", content: contentText(message?.content) },
          { role: "user", content: MALFORMED_RETRY }
        ];
      }
    }
  };
}
function requestLimit(size) {
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError("a request limit needs an integer size of at least 1");
  let active = 0;
  const waiting = [];
  return { size, async acquire(signal) {
    while (active >= size) {
      signal?.throwIfAborted();
      await new Promise((resolve, reject) => {
        const wake = () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          const at = waiting.indexOf(wake);
          if (at >= 0) waiting.splice(at, 1);
          reject(signal.reason);
        };
        waiting.push(wake);
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
    active++;
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      active--;
      waiting.shift()?.();
    };
  } };
}
function limitedTransport(transport, limit) {
  return async (body, signal, meta) => {
    const release = await limit.acquire(signal);
    let result;
    try {
      result = await transport(body, signal, meta);
    } catch (error) {
      release();
      throw error;
    }
    if (!isStream(result)) {
      release();
      return result;
    }
    const stream = result;
    return (async function* () {
      try {
        yield* stream;
      } finally {
        release();
      }
    })();
  };
}
function promptLogprobDecider(transport, options = {}) {
  const { max_tokens: _max, temperature: _temperature, stream: _stream, ...extra } = options.request ?? {};
  return async (item, signal) => {
    const { messages, options: replies } = item;
    if (!replies.length) throw new Error("a decision needs at least one option");
    const itemExtra = options.extraFor?.(item);
    const responses = await Promise.all(replies.map(async (reply) => {
      const raw = await transport({ ...promptLogprobRequest(messages, reply, { ...extra, ...itemExtra }, item.open_reply === true, item.reasoning) }, signal);
      return isStream(raw) ? await assembleChatCompletion(raw) : raw;
    }));
    return scoresFromPromptLogprobs(responses);
  };
}
var longDispatcher;
var localEndpoints = /* @__PURE__ */ new Map();
async function fetchModel(url, init = {}) {
  for (const [base, handler] of localEndpoints) if (url === base || url.startsWith(base + "/")) return handler(url, init);
  if (typeof process !== "undefined" && process.versions?.node) {
    longDispatcher ??= import(
      /* @vite-ignore */
      "undici"
    ).then(({ Agent }) => new Agent({ headersTimeout: 0, bodyTimeout: 0 }), () => void 0);
    const dispatcher = await longDispatcher;
    if (dispatcher) return fetch(url, { ...init, dispatcher });
  }
  return fetch(url, init);
}
async function* serverSentChunks(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        const chunk = JSON.parse(data);
        if (chunk.error) throw new Error(`model stream error: ${JSON.stringify(chunk.error).slice(0, 2e3)}`);
        yield chunk;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
function openAIEndpointRoot(endpoint) {
  return endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
}
function httpChatTransport(options) {
  if (!options.endpoint || !options.model) throw new Error("model endpoint and ID are required");
  const url = options.chatCompletionsUrl ?? openAIEndpointRoot(options.endpoint) + "/v1/chat/completions";
  const streams = options.stream ?? true;
  return async (body, signal) => {
    const stream = streams && body.stream !== false;
    let response;
    try {
      response = await fetchModel(url, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          ...options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {},
          ...options.headers
        },
        body: JSON.stringify({
          ...body,
          model: options.model,
          ...stream ? { stream: true, stream_options: { include_usage: true } } : {}
        })
      });
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      throw new Error(
        `model request to ${url} failed: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`,
        { cause: error }
      );
    }
    if (!response.ok) {
      const text = await response.text();
      let body2;
      try {
        body2 = JSON.parse(text);
      } catch {
        body2 = void 0;
      }
      const errorBody = providerErrorBody(body2) ?? {};
      throw Object.assign(new Error(`model HTTP ${response.status}: ${text.slice(0, 2e3)}`), {
        status: response.status,
        headers: response.headers,
        ...typeof errorBody?.code === "string" ? { providerCode: errorBody.code } : {},
        ...typeof errorBody?.provider_retryable === "boolean" ? { providerRetryable: errorBody.provider_retryable } : typeof errorBody?.providerRetryable === "boolean" ? { providerRetryable: errorBody.providerRetryable } : {},
        ...Number.isFinite(errorBody?.retry_after_ms) ? { retry_after_ms: errorBody.retry_after_ms } : {},
        ...Number.isFinite(errorBody?.retry_after) ? { retry_after: errorBody.retry_after } : {}
      });
    }
    if (stream && response.body && /text\/event-stream/.test(response.headers.get("content-type") ?? ""))
      return serverSentChunks(response.body);
    return await response.json();
  };
}

// src/model/scoring.ts
function concurrentScoreMany(score) {
  return (items, signal) => Promise.allSettled(items.map((item) => score(item, signal)));
}
function coalescingScorer(base, options = {}) {
  const windowMs = options.windowMs ?? 0, maxItems = options.maxItems ?? 256;
  const many = base.scoreMany ?? concurrentScoreMany(base);
  let batchCounter = 0;
  let pending = [], timer;
  const flush = () => {
    if (timer !== void 0) {
      clearTimeout(timer);
      timer = void 0;
    }
    const batch = pending.filter((entry) => !entry.signal?.aborted);
    pending = [];
    if (!batch.length) return;
    const batchId = `d${++batchCounter}`;
    many(batch.map((entry) => entry.item)).then((results) => {
      batch.forEach((entry, index) => {
        const result = results[index];
        if (!result) entry.reject(new Error("scoreMany returned too few results"));
        else if (result.status === "fulfilled") entry.resolve({ ...result.value, batch: { batch_id: batchId, batch_size: batch.length } });
        else entry.reject(result.reason);
      });
    }, (failure) => batch.forEach((entry) => entry.reject(failure)));
  };
  const scorer = (request, signal) => {
    try {
      signal?.throwIfAborted();
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      pending.push({ item: request, signal, resolve, reject });
      if (pending.length >= maxItems) flush();
      else if (timer === void 0) timer = setTimeout(flush, windowMs);
    });
  };
  return Object.assign(scorer, { scoreMany: many });
}
var ScoreEndpointMissing = class extends Error {
};
async function postExplicitBatch(options, items, signal) {
  const release = options.scheduler ? await options.scheduler.acquire({}, signal) : () => {
  };
  try {
    const response = await fetchModel(options.url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify({ ...options.extra, items: items.map((item) => batchScoreItem(item, options.itemExtra?.(item))) })
    });
    const absent = [404, 405, 501].includes(response.status) || options.discovered === true && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    if (absent) throw new ScoreEndpointMissing(`no scoring endpoint at ${options.url}`);
    if (!response.ok) throw new Error(`batched scoring HTTP ${response.status}: ${(await response.text()).slice(0, 2e3)}`);
    const body = await response.json().catch(() => ({}));
    if (options.discovered === true && !Array.isArray(body.results)) throw new ScoreEndpointMissing(`no scoring endpoint at ${options.url}`);
    if (!Array.isArray(body.results) || body.results.length !== items.length)
      throw new Error("batched scoring returned a different number of results than items");
    return body.results.map((result, index) => {
      try {
        return { status: "fulfilled", value: scoresFromBatchResult(result, items[index]) };
      } catch (reason) {
        return { status: "rejected", reason };
      }
    });
  } finally {
    release();
  }
}
function explicitBatchScoreMany(options, fallback) {
  let missing = false;
  const maxItems = options.maxItems ?? 64, minItems = options.minItems ?? 2;
  return async (items, signal) => {
    if (missing || items.length < minItems) return fallback(items, signal);
    const out = [];
    for (let start = 0; start < items.length; start += maxItems) {
      const chunk = items.slice(start, start + maxItems);
      try {
        out.push(...await postExplicitBatch(options, chunk, signal));
      } catch (error) {
        if (error instanceof ScoreEndpointMissing) {
          missing = true;
          out.push(...await fallback(items.slice(start), signal));
          return out;
        }
        if (signal?.aborted) throw error;
        out.push(...chunk.map(() => ({ status: "rejected", reason: error })));
      }
    }
    return out;
  };
}

// src/native/model-recording.ts
var source = () => void 0;
function setRecorderSource(next) {
  source = next;
}
function activeRecorder() {
  return source();
}
var nativeAdapterSource = () => void 0;
var nativeStateSource = () => void 0;
function setNativeAdapterSource(next) {
  nativeAdapterSource = next;
}
function setNativeStateSource(next) {
  nativeStateSource = next;
}
var lexicalAdapterSource = () => void 0;
var lexicalSoftStateSource = () => void 0;
function setLexicalSoftStateSource(next) {
  lexicalSoftStateSource = next;
}
function activeSoftStates() {
  return lexicalSoftStateSource() ?? [];
}
function setLexicalNativeAdapterSource(next) {
  lexicalAdapterSource = next;
}
function activeNativeAdapters() {
  const lexical = lexicalAdapterSource(), explicit = nativeAdapterSource();
  return lexical?.length ? explicit?.length ? [...lexical, ...explicit] : lexical : explicit ?? [];
}
function activeNativeStates() {
  return nativeStateSource() ?? [];
}
var ModelTurnRecorder = class {
  turns = [];
  /** Turns of outputs captured under their own recorder (function outputs): never claimed by an objective, but
   * producers of the gradient session like any other turn, so a downstream loss reaches their writes. */
  nested = [];
  claimed = 0;
  /** Objectives awaiting a promise output right now, and whether two of them overlapped (see `capture`). */
  active = 0;
  overlapped = false;
  graphNodes = /* @__PURE__ */ new Map();
  nativeLinks = /* @__PURE__ */ new Map();
  graphConflicts = /* @__PURE__ */ new Set();
  record(turn) {
    this.turns.push(turn);
  }
  recordGraphNode(event) {
    if (typeof event.node === "string") {
      const previous = this.graphNodes.get(event.node);
      if (previous && JSON.stringify(previous) !== JSON.stringify(event)) this.graphConflicts.add(event.node);
      else this.graphNodes.set(event.node, structuredClone(event));
    }
  }
  nativeStateWriters(id2) {
    const writers = [...this.graphNodes.values()].filter((event) => event.kind === "block_write" && event.block === id2);
    const nodes = writers.map((event) => event.node).filter((node) => typeof node === "string");
    if (nodes.some((node) => this.graphConflicts.has(node))) throw Object.assign(
      new Error(`neuralese-native-grad-invalid: native state ${id2} has a conflicting in-trajectory writer occurrence`),
      { code: "neuralese-native-grad-invalid" }
    );
    return nodes;
  }
  nativeStateWriter(id2) {
    const writers = this.nativeStateWriters(id2);
    if (writers.length > 1) throw Object.assign(new Error(`neuralese-native-grad-invalid: native state ${id2} has multiple possible in-trajectory producers`), { code: "neuralese-native-grad-invalid" });
    return writers[0];
  }
  linkNativeTurn(id2, graphTurn) {
    if (!this.turns.some((turn) => turn.native?.id === id2)) throw Object.assign(new Error("neuralese-native-grad-invalid: native graph link has no exact recorded model turn"), { code: "neuralese-native-grad-invalid" });
    this.bindNativeTurn(id2, graphTurn);
    this.linkTurn(id2, graphTurn);
  }
  linkTurn(id2, graphTurn) {
    const index = this.turns.findIndex((turn) => turn.recording_id === id2 || turn.native?.id === id2);
    if (index < 0) throw Object.assign(new Error("neuralese-native-grad-invalid: graph link has no recorded model turn"), { code: "neuralese-native-grad-invalid" });
    const node = this.graphNodes.get(graphTurn), actor = node?.actor;
    const initial = node?.initial_actor;
    if (node?.kind !== "model_turn") throw Object.assign(new Error("neuralese-native-grad-invalid: recorded turn has no graph model turn"), { code: "neuralese-native-grad-invalid" });
    this.turns[index] = {
      ...this.turns[index],
      graph_turn: graphTurn,
      ...actor ? { actor: structuredClone(actor) } : {},
      ...initial ? { initial_actor: structuredClone(initial) } : {}
    };
  }
  bindNativeTurn(id2, graphTurn) {
    const previous = this.nativeLinks.get(id2);
    if (previous && previous !== graphTurn) throw Object.assign(new Error("neuralese-native-grad-invalid: native receipt was linked to two model-turn occurrences"), { code: "neuralese-native-grad-invalid" });
    this.nativeLinks.set(id2, graphTurn);
  }
  absorb(other) {
    for (const node of other.graphNodes.values()) this.recordGraphNode(node);
    for (const id2 of other.graphConflicts) this.graphConflicts.add(id2);
    for (const [id2, turn] of other.nativeLinks) this.bindNativeTurn(id2, turn);
  }
  nativeTurns() {
    if ([...this.turns, ...this.nested].some((turn) => turn.native) && this.graphConflicts.size)
      throw Object.assign(new Error("neuralese-native-grad-invalid: native execution graph reuses conflicting source node identities"), { code: "neuralese-native-grad-invalid" });
    return [...this.turns, ...this.nested].filter((turn) => turn.native).map((turn) => {
      const graphTurn = this.nativeLinks.get(turn.native.id);
      if (!graphTurn) return structuredClone(turn);
      const modelNode = this.graphNodes.get(graphTurn);
      if (modelNode?.kind !== "model_turn" || turn.native.invocation_id && modelNode.call_id !== turn.native.invocation_id || turn.native.kind === "decision" && modelNode.readout !== "decision" || turn.native.kind === "generation" && modelNode.readout !== void 0)
        throw Object.assign(new Error("neuralese-native-grad-invalid: native receipt does not match its actual model-turn occurrence"), { code: "neuralese-native-grad-invalid" });
      const capture = turn.native.kind === "generation" ? turn.native.sampling : turn.native.decision;
      const binding = nativeCaptureGraphBinding(graphTurn, capture, this.graphNodes);
      const actor = modelNode.actor;
      if (actor && (typeof actor.id !== "string" || !actor.id || !(actor.revision === null || typeof actor.revision === "string")))
        throw Object.assign(new Error("neuralese-native-grad-invalid: model turn has an invalid actor"), { code: "neuralese-native-grad-invalid" });
      return {
        ...structuredClone(turn),
        ...actor ? { actor: structuredClone(actor) } : {},
        graph_turn: graphTurn,
        native: { ...structuredClone(turn.native), ...actor ? { actor: structuredClone(actor) } : {}, graph: binding }
      };
    });
  }
  /** Turns recorded since the previous claim. */
  claim() {
    const out = this.turns.slice(this.claimed);
    this.claimed = this.turns.length;
    return out;
  }
};
function nativeCaptureGraphBinding(name, capture, nodes) {
  const writes = [...nodes.values()].filter((event) => event.kind === "block_write" && event.turn === name);
  const reads = [...nodes.values()].filter((event) => event.kind === "block_read" && event.turn === name);
  const capturedWrites = capture.writes ?? [];
  const capturedReads = (capture.prompt ?? []).filter((segment) => segment.kind === "native_state");
  const fail = (message) => {
    throw Object.assign(new Error(`neuralese-native-grad-invalid: ${message}`), { code: "neuralese-native-grad-invalid" });
  };
  const source2 = (event) => {
    const edges = Array.isArray(event.inputs) ? event.inputs : [];
    const sources = edges.filter((edge) => edge.block === event.block).map((edge) => edge.node);
    return sources.length === 1 && typeof sources[0] === "string" && sources[0] ? sources[0] : fail("native read needs one exact writer or external input");
  };
  if (writes.length !== capturedWrites.length || reads.length !== capturedReads.length) fail("native capture differs from actual state occurrence inventory");
  const boundWrites = capturedWrites.map((write, index) => {
    const at = writes.findIndex((event2) => event2.block === write.state_id);
    if (at < 0) fail("native write changed its actual artifact");
    const event = writes.splice(at, 1)[0];
    return { index, id: String(event.block), node: String(event.node) };
  });
  const boundReads = capturedReads.map((segment, index) => {
    if (segment.source_state_id !== void 0 && segment.source_state_id !== segment.id) fail("semantic input requires differentiable codec lowering");
    const candidates = reads.filter((event2) => event2.block === segment.id && event2.stop_gradient === segment.stop_gradient && (segment.source_occurrence === void 0 || source2(event2) === segment.source_occurrence));
    if (!candidates.length || new Set(candidates.map(source2)).size !== 1) fail("native input has ambiguous or changed source occurrence");
    const event = candidates[0];
    reads.splice(reads.indexOf(event), 1);
    const occurrenceSource = source2(event);
    if (occurrenceSource !== "external") {
      const writer = nodes.get(occurrenceSource);
      if (writer?.kind !== "block_write" || writer.block !== segment.id)
        fail("native read references a writer occurrence absent from the exact episode graph");
    }
    return {
      index,
      id: String(segment.id),
      source_state_id: String(segment.id),
      node: String(event.node),
      source: occurrenceSource,
      ...segment.stop_gradient === true ? { stop_gradient: true } : {}
    };
  });
  const count = (items) => {
    const counts = /* @__PURE__ */ new Map();
    for (const id2 of items) counts.set(id2, (counts.get(id2) ?? 0) + 1);
    return counts;
  };
  const wc = count(boundWrites.map((item) => item.id)), rc = count(boundReads.map((item) => item.source_state_id));
  return {
    graph_turn: name,
    written_nodes: Object.fromEntries(boundWrites.filter((item) => wc.get(item.id) === 1).map((item) => [item.id, item.node])),
    read_bindings: Object.fromEntries(boundReads.filter((item) => rc.get(item.source_state_id) === 1 && item.source !== "external").map((item) => [item.source_state_id, item.source])),
    ...[...wc.values()].some((value) => value > 1) ? { written_occurrences: boundWrites } : {},
    // External roots and repeated imports have no unique producer keyed by ID.
    // Keep every actual occurrence so native-state objectives can bind exact
    // targets and gradients without guessing from an ID-only map.
    ...[...rc.values()].some((value) => value > 1) || boundReads.some((item) => item.source === "external") ? { read_occurrences: boundReads } : {}
  };
}

// src/model/neuralese-info.ts
function serves(info, capability) {
  return Array.isArray(info.capabilities) && info.capabilities.includes(capability);
}
async function neuraleseServerInfo(endpoint, options = {}) {
  const url = openAIEndpointRoot(endpoint) + "/v1/neuralese/info";
  let response;
  try {
    response = await fetchModel(url, {
      signal: options.signal,
      headers: { ...options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}, ...options.headers }
    });
  } catch (error) {
    throw new Error(
      `neuralese-unsupported-backend: ${url} could not be reached (${error instanceof Error ? error.message : String(error)})`,
      { cause: error }
    );
  }
  if (!response.ok) throw new Error(`neuralese-unsupported-backend: ${url} answered HTTP ${response.status}; the server does not declare Neuralese dialects`);
  const info = await response.json();
  if (!Array.isArray(info.dialects) || !info.dialects.every((dialect) => typeof dialect === "string"))
    throw new Error(`neuralese-unsupported-backend: ${url} names no dialects`);
  return info;
}

// src/model/native-coefficient-policy.ts
var id = /^nnt1_[a-z2-7]{52}$/;
var invalid = () => {
  throw new Error("neuralese-native-coefficient-policy: restore the exact declared actor policy and its coefficient bundle");
};
function validateCoefficientRuntime(value) {
  const policy = value;
  if (!policy || Object.keys(policy).sort().join(",") !== "base_native_identity,defaults,policy_sha256,replacements,schema,state_transport" || policy.schema !== "natlang.native-coefficient-runtime/1" || !/^[0-9a-f]{64}$/.test(policy.policy_sha256) || !["strict", "same-base-adapter-state"].includes(policy.state_transport) || !policy.replacements || typeof policy.replacements !== "object" || Array.isArray(policy.replacements) || !Object.keys(policy.replacements).length || Object.entries(policy.replacements).some(([before, after]) => !id.test(before) || typeof after !== "string" || !id.test(after)) || !Array.isArray(policy.defaults) || policy.defaults.some((entry) => !entry || Object.keys(entry).sort().join(",") !== "id,scale" || !(entry.id in policy.replacements) || typeof entry.scale !== "number" || !Number.isFinite(entry.scale))) return invalid();
  const base = policy.base_native_identity;
  if (!base || Object.keys(base).sort().join(",") !== "architecture,checkpoint_sha256,embedding_weight_sha256,tokenizer_fingerprint" || ![base.checkpoint_sha256, base.tokenizer_fingerprint, base.embedding_weight_sha256].every((value2) => typeof value2 === "string" && /^[0-9a-f]{64}$/.test(value2)) || typeof base.architecture !== "string" || !base.architecture) return invalid();
  return policy;
}
function requireCoefficientAttestation(policy, info) {
  const receipt = info?.rl_policy_binding;
  if (!receipt?.native_identity || !nativeModelIdentityEqual(receipt.native_identity, policy.base_native_identity) || receipt.coefficient_policy_sha256 !== policy.policy_sha256 || nativeCanonicalJson(receipt.coefficient_policy) !== nativeCanonicalJson(policy)) invalid();
}
function coefficientBindings(policy, active, bound) {
  return [...policy?.defaults ?? [], ...active, ...bound].map((entry) => ({ ...entry, id: policy?.replacements[entry.id] ?? entry.id }));
}
function coefficientStateModes(policy, ids, explicit) {
  if (policy?.state_transport !== "same-base-adapter-state") return explicit;
  return { ...Object.fromEntries(ids.map((id2) => [id2, "same-base-adapter-state"])), ...explicit };
}

// src/model/neuralese-server.ts
var OWNER_HEADER = "x-natlang-owner";
function isUnknownNativeArtifactError(error) {
  const found = error;
  return found?.providerCode === "neuralese-unknown-native-state" || found?.code === "neuralese-unknown-native-state" || found?.providerCode === "neuralese-unknown-native-artifact" || found?.code === "neuralese-unknown-native-artifact" || typeof found?.message === "string" && /neuralese-unknown-native-(?:state|artifact)/.test(found.message);
}
async function restoreNativeArtifacts(remote, archive, ids) {
  const missing = [], visited = /* @__PURE__ */ new Set();
  const restore = async (id2) => {
    if (visited.has(id2)) return;
    visited.add(id2);
    if (id2.startsWith("nzs1_")) {
      const artifact = await archive?.getNativeState?.(id2) ?? await remote.getNativeState?.(id2);
      if (!artifact || !remote.putNativeState) {
        missing.push(id2);
        return;
      }
      const before = missing.length;
      for (const dependency of nativeStateArtifactDependencies(artifact)) await restore(dependency);
      if (missing.length !== before) return;
      if (!await remote.has(id2)) {
        const { id: _, ...input } = artifact;
        if ((await remote.putNativeState(input)).id !== id2) throw new Error(`native state changed while restoring ${id2}`);
      }
      return;
    }
    if (id2.startsWith("nnt1_")) {
      const artifact = await archive?.getNativeTensorArtifact?.(id2) ?? await remote.getNativeTensorArtifact?.(id2);
      if (!artifact || !remote.putNativeTensorArtifact) {
        missing.push(id2);
        return;
      }
      for (const dependency of nativeTensorArtifactDependencies(artifact)) await restore(dependency);
      if (!await remote.has(id2)) {
        const { id: _, ...input } = artifact;
        if ((await remote.putNativeTensorArtifact(input)).id !== id2) throw new Error(`native artifact changed while restoring ${id2}`);
      }
      return;
    }
    throw Object.assign(
      new TypeError(`native artifact restore requires an nzs1 state or nnt1 tensor ID, got ${JSON.stringify(id2)}`),
      { code: "neuralese-native-artifact-id" }
    );
  };
  for (const id2 of new Set(ids)) await restore(id2);
  return missing;
}
async function withRestoredNativeArtifacts(remote, archive, ids, run, known) {
  const restore = async (all) => {
    if (all) for (const id2 of ids) known?.delete(id2);
    const pending = known ? ids.filter((id2) => !known.has(id2)) : ids;
    const missing = await restoreNativeArtifacts(remote, archive, pending);
    if (missing.length) throw new Error(`neuralese-unknown-native-artifact: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} neither on the server nor in the runtime's store`);
    for (const id2 of pending) known?.add(id2);
  };
  await restore(false);
  try {
    return await run();
  } catch (error) {
    if (!isUnknownNativeArtifactError(error)) throw error;
    await restore(true);
    return await run();
  }
}
var HttpNeuraleseStore = class {
  constructor(endpoint, headers = {}) {
    this.headers = headers;
    this.base = endpoint.replace(/\/$/, "") + "/v1/neuralese";
  }
  headers;
  base;
  async request(path, init = {}) {
    return fetchModel(this.base + path, { ...init, headers: { ...this.headers, ...init.headers ?? {} } });
  }
  async putNativeState(artifact) {
    const id2 = nativeStateContentId(artifact.metadata, artifact.tensors);
    const response = await this.request(`/native-states/${id2}`, {
      method: "PUT",
      body: encodeNativeState(artifact),
      headers: { "content-type": "application/octet-stream" }
    });
    if (!response.ok) throw new Error(`native-state upload failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    return { ...structuredClone(artifact), id: id2 };
  }
  async getNativeState(id2) {
    const wire = await this.getNativeStateWire(id2);
    return wire && decodeNativeState(wire, id2);
  }
  /** The server's stored bytes, verified once here (header, finite values, content ID); kept as received. */
  async getNativeStateWire(id2) {
    const response = await this.request(`/native-states/${id2}`);
    if (response.status === 404) return void 0;
    if (!response.ok) throw new Error(`native-state fetch failed (${response.status})`);
    const wire = new Uint8Array(await response.arrayBuffer());
    const artifact = decodeNativeState(wire);
    if (artifact.id !== id2) throw new Error(`native-state identity mismatch: requested ${id2}, received ${artifact.id}`);
    return wire;
  }
  /** Upload stored bytes as they are. */
  async putNativeStateWire(wire, verifiedId) {
    const artifact = decodeNativeState(wire, verifiedId);
    const response = await this.request(`/native-states/${artifact.id}`, {
      method: "PUT",
      body: wire,
      headers: { "content-type": "application/octet-stream" }
    });
    if (!response.ok) throw new Error(`native-state upload failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    return artifact;
  }
  async hasNativeState(id2) {
    const response = await this.request(`/native-states/${id2}/meta`);
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`native-state metadata failed (${response.status})`);
    return true;
  }
  async putNativeTensorArtifact(artifact) {
    const id2 = nativeTensorArtifactContentId(artifact.metadata, artifact.tensors, artifact.canonicalMetadata);
    const response = await this.request(`/native-tensor-artifacts/${id2}`, {
      method: "PUT",
      body: encodeNativeTensorArtifact(artifact),
      headers: { "content-type": "application/octet-stream" }
    });
    if (!response.ok) throw new Error(`native tensor artifact upload failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    return decodeNativeTensorArtifact(encodeNativeTensorArtifact(artifact));
  }
  async getNativeTensorArtifact(id2) {
    const response = await this.request(`/native-tensor-artifacts/${id2}`);
    if (response.status === 404) return void 0;
    if (!response.ok) throw new Error(`native tensor artifact fetch failed (${response.status})`);
    const artifact = decodeNativeTensorArtifact(new Uint8Array(await response.arrayBuffer()));
    if (artifact.id !== id2) throw new Error(`native tensor artifact identity mismatch: requested ${id2}, received ${artifact.id}`);
    return artifact;
  }
  async hasNativeTensorArtifact(id2) {
    const response = await this.request(`/native-tensor-artifacts/${id2}/meta`);
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`native tensor artifact metadata failed (${response.status})`);
    return true;
  }
  async meta(id2) {
    if (isNativeStateId(id2)) {
      const artifact = await this.getNativeState(id2);
      return artifact && nativeStateBlockMeta(artifact);
    }
    if (/^nnt1_[a-z2-7]{52}$/.test(id2)) {
      const response = await this.request(`/native-tensor-artifacts/${id2}/meta`);
      if (response.status === 404) return void 0;
      if (!response.ok) throw new Error(`native tensor artifact metadata failed (${response.status})`);
      const record2 = await response.json();
      return nativeTensorArtifactBlockMeta({ id: record2.id, metadata: {
        schema: record2.schema,
        kind: record2.kind,
        native_identity: record2.native_identity,
        source_artifact_id: record2.source_artifact_id,
        provenance: record2.provenance,
        tensors: record2.tensors
      } });
    }
    return void 0;
  }
  async has(id2) {
    return await this.meta(id2) !== void 0;
  }
  async pin(id2) {
    const family = id2.startsWith("nzs1_") ? "native-states" : id2.startsWith("nnt1_") ? "native-tensor-artifacts" : void 0;
    if (!family) throw new Error(`neuralese-native-archive-api: only native states and tensor artifacts can be pinned (${id2})`);
    const response = await this.request(`/${family}/${id2}/pin`, { method: "POST" });
    if (!response.ok) throw new Error(`neuralese-unknown-native-artifact: ${id2}`);
  }
  async unpin(id2) {
    const family = id2.startsWith("nzs1_") ? "native-states" : id2.startsWith("nnt1_") ? "native-tensor-artifacts" : void 0;
    if (!family) throw new Error(`neuralese-native-archive-api: only native states and tensor artifacts can be unpinned (${id2})`);
    await this.request(`/${family}/${id2}/unpin`, { method: "POST" });
  }
  async collect(referenced) {
    const response = await this.request("/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referenced: [...referenced] })
    });
    return (await response.json()).removed;
  }
};
function malformedNativePartList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((part) => part && typeof part === "object" && ["text", "native_state"].includes(part.type)) && value.some((part) => part.type === "native_state" && !isNativeStateId(part.id));
}
function requestNativeStateIds(messages) {
  const ids = /* @__PURE__ */ new Set();
  const visit = (value, key) => {
    if (key === "arguments" && typeof value === "string") {
      try {
        visit(JSON.parse(value));
      } catch {
      }
      return;
    }
    if (malformedNativePartList(value)) return;
    if (Array.isArray(value) && value.length && value.every((part) => part && typeof part === "object" && (part.type === "text" && typeof part.text === "string" || part.type === "native_state" && isNativeStateId(part.id)))) {
      for (const part of value) if (part.type === "native_state") ids.add(part.id);
      return;
    }
    if (typeof value === "string") {
      nativeStateSentinelIds(value).forEach((id2) => ids.add(id2));
      return;
    }
    if (Array.isArray(value)) value.forEach((item) => visit(item));
    else if (value && typeof value === "object") {
      const part = value;
      if (part.type === "native_state" && isNativeStateId(part.id)) {
        ids.add(part.id);
        return;
      }
      for (const [name, item] of Object.entries(value)) visit(item, name);
    }
  };
  visit(messages);
  return [...ids];
}
function requestNativeStateBindings(messages) {
  const bindings = [];
  const add = (id2, source2, path) => {
    if (!isNativeStateId(id2)) return;
    if (source2 !== void 0 && (typeof source2 !== "string" || !source2))
      throw Object.assign(
        new Error(`neuralese-native-grad-invalid: malformed native source occurrence at ${path}`),
        { code: "neuralese-native-grad-invalid" }
      );
    bindings.push({ id: id2, ...typeof source2 === "string" ? { source_occurrence: source2 } : {}, path });
  };
  const visit = (value, key, path) => {
    if (key === "arguments" && typeof value === "string") {
      try {
        visit(JSON.parse(value), void 0, path);
      } catch (error) {
        if (error instanceof SyntaxError) return;
        throw error;
      }
      return;
    }
    if (malformedNativePartList(value)) return;
    if (Array.isArray(value) && value.length > 0 && value.every((part) => part && typeof part === "object" && (part.type === "text" && typeof part.text === "string" || part.type === "native_state" && isNativeStateId(part.id)))) {
      value.forEach((part, index) => {
        if (part.type === "native_state") add(part.id, part.source_occurrence, `${path}[${index}]`);
      });
      return;
    }
    if (typeof value === "string") {
      let occurrence = 0;
      for (const part of runtimeTextToParts(value)) if (part.type === "native_state")
        add(part.id, part.source_occurrence, `${path}.sentinel[${occurrence++}]`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, void 0, `${path}[${index}]`));
    } else if (value && typeof value === "object") {
      const part = value;
      if (part.type === "native_state" && isNativeStateId(part.id)) {
        add(part.id, part.source_occurrence, path);
        return;
      }
      for (const [name, item] of Object.entries(value)) visit(item, name, `${path}.${name}`);
    }
  };
  visit(messages, void 0, "messages");
  return bindings;
}
function materializeNativeStateSentinels(value, key) {
  if (Array.isArray(value)) {
    if (value.some((part) => part && typeof part === "object" && part.type === "neuralese"))
      throw new TypeError("native chat content does not accept flat vector blocks");
    if (value.some((part) => part && typeof part === "object" && part.type === "native_state" && !isNativeStateId(part.id)))
      throw new TypeError("native chat content requires an archived nzs1 state ID");
  }
  if (key === "arguments" && typeof value === "string") {
    try {
      return JSON.stringify(materializeNativeStateSentinels(JSON.parse(value)));
    } catch {
      return value;
    }
  }
  if (malformedNativePartList(value)) return value;
  if (typeof value === "string") {
    return nativeStateSentinelIds(value).length ? runtimeTextToParts(value) : value;
  }
  if (Array.isArray(value) && value.length && value.every((part) => part && typeof part === "object" && (part.type === "text" && typeof part.text === "string" || part.type === "native_state" && isNativeStateId(part.id))))
    return value.flatMap((part) => {
      return part.type === "text" ? runtimeTextToParts(part.text) : [part];
    });
  if (Array.isArray(value)) return value.map((item) => materializeNativeStateSentinels(item));
  if (value && typeof value === "object") {
    const part = value;
    if (part.type === "native_state" && part.source_occurrence !== void 0 && (typeof part.source_occurrence !== "string" || !part.source_occurrence)) throw new TypeError("native source occurrence must be a nonempty actual writer reference");
    if (part.type === "native_state" && part.stop_gradient !== void 0 && part.stop_gradient !== true) throw new TypeError("native state constant-use metadata must be true or absent");
    if (part.type === "native_state" && isNativeStateId(part.id)) return [{
      type: "native_state",
      id: part.id,
      ...part.stop_gradient === true ? { stop_gradient: true } : {},
      ...typeof part.source_occurrence === "string" ? { source_occurrence: part.source_occurrence } : {}
    }];
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, materializeNativeStateSentinels(item, name)]));
  }
  return value;
}
async function restoreNativeStates(remote, archive, ids, known, all = false) {
  if (all) for (const id2 of ids) known?.delete(id2);
  const missing = [];
  for (const id2 of ids) {
    const local = await archive?.getNativeState?.(id2);
    const dependencies = local ? nativeStateArtifactDependencies(local) : [];
    if (dependencies.length) {
      if (!remote.putNativeTensorArtifact || !remote.meta)
        throw new Error(`neuralese-native-archive-unavailable: native state ${id2} depends on adapter artifacts this engine cannot hold`);
      const absent = await restoreNativeArtifacts(remote, archive, dependencies);
      if (absent.length) throw new Error(`neuralese-unknown-native-artifact: restore source adapter coefficients and bases ${absent.join(", ")}`);
    }
    if (known?.has(id2)) continue;
    if (await remote.hasNativeState(id2)) {
      known?.add(id2);
      continue;
    }
    const artifact = local;
    if (!artifact) {
      missing.push(id2);
      continue;
    }
    const wire = await archive?.getNativeStateWire?.(id2);
    const { id: _, ...input } = artifact;
    const restored = wire ? await remote.putNativeStateWire(wire, id2) : await remote.putNativeState(input);
    if (restored.id !== id2) throw new Error(`native-state identity mismatch while restoring ${id2}`);
    known?.add(id2);
  }
  if (missing.length) throw new Error(`neuralese-unknown-native-state: ${missing.join(", ")} neither on the server nor in the runtime store`);
}
async function withRestoredNativeStates(remote, archive, ids, run, known) {
  await restoreNativeStates(remote, archive, ids, known);
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof Error) || !/neuralese-unknown-native-state/.test(error.message)) throw error;
    await restoreNativeStates(remote, archive, ids, known, true);
    return await run();
  }
}
function normalizeReply(body) {
  const choice = body.choices?.[0];
  const message = choice?.message;
  if (!message) return body;
  for (const call of message.tool_calls ?? []) {
    const fn = call.function;
    if (!fn) continue;
    const parsed = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
    fn.arguments = JSON.stringify(parsed);
  }
  return body;
}
async function archiveNeuraleseReplyArtifacts(reply, remote, store, references = []) {
  const projectedBlocks = reply.neuralese?.blocks;
  if (Array.isArray(projectedBlocks) && projectedBlocks.length)
    throw new Error("neuralese-projected-api-retired: server returned flat neuralese blocks");
  const nativeBlocks = reply.native_state?.blocks ?? [];
  const sampling = reply.x_natlang_rl_capture;
  const native = /* @__PURE__ */ new Set([...nativeBlocks.map((meta) => meta.id), ...requestNativeStateIds([reply, ...references])]);
  for (const observation of sampling?.prompt ?? [])
    if (observation.kind === "native_state") {
      for (const id2 of [observation.id, observation.source_state_id]) if (id2) native.add(id2);
    }
  for (const write of sampling?.writes ?? [])
    for (const id2 of [write.state_id, write.raw_state_id]) if (id2) native.add(id2);
  for (const id2 of native) {
    if (!isNativeStateId(id2)) throw new Error("neuralese-block-integrity: sampling receipt names an invalid native artifact");
    if (!store) continue;
    if (!store.putNativeState || !store.getNativeState)
      throw new Error("neuralese-native-archive-unavailable: configure a store that preserves native-state artifacts");
    await archiveNativeArtifactFrom(remote, store, id2);
  }
  return { native };
}
function reasonedFields(item) {
  return {
    ...typeof item?.reasoning === "string" ? { reasoning: item.reasoning } : {},
    ...item?.reasoning_sample ? { reasoning_sample: { ...item.reasoning_sample } } : {}
  };
}
function neuraleseServerModelTurn(options) {
  const {
    store,
    request: extra,
    onExchange,
    onTurn,
    owner,
    nativeStateModes,
    ...connection
  } = options;
  const http = { ...connection, headers: {
    ...connection.headers,
    ...connection.apiKey ? { authorization: "Bearer " + connection.apiKey } : {},
    ...owner === void 0 ? {} : { [OWNER_HEADER]: owner }
  } };
  const remote = new HttpNeuraleseStore(http.endpoint, http.headers);
  const coefficientPolicy = extra?.x_natlang_native_coefficient_policy === void 0 ? void 0 : validateCoefficientRuntime(extra.x_natlang_native_coefficient_policy);
  const uploaded = /* @__PURE__ */ new Set();
  const nativeUploaded = /* @__PURE__ */ new Set();
  let info;
  const serverInfo = (refresh = false) => {
    if (refresh) info = void 0;
    return info ??= fetchModel(http.endpoint.replace(/\/$/, "") + "/v1/neuralese/info", { headers: http.headers }).then(async (response) => response.ok ? await response.json() : null).catch(() => null);
  };
  const whole = httpChatTransport({ ...http, stream: false });
  const streamed = httpChatTransport({ ...http, stream: true });
  const adapterParts = async (bound = [], active = activeNativeAdapters()) => {
    if (coefficientPolicy) requireCoefficientAttestation(coefficientPolicy, await serverInfo());
    const adapters = coefficientBindings(coefficientPolicy, active, bound);
    return adapters;
  };
  const adapterArtifactIds = (adapters) => adapters.map((item) => item.id);
  const bindNativeStateContext = async (messages, states, capabilities) => {
    if (!states.length) return messages;
    const consumer = capabilities ? nativeStateConsumerFromInfo(capabilities) : void 0;
    if (!consumer || !store?.getNativeState)
      throw Object.assign(
        new Error("neuralese-native-state-unavailable: withNativeStates requires a declared native reader and an archived state store"),
        { code: "neuralese-native-state-unavailable" }
      );
    const parts = [];
    const alreadyPresent = new Set(requestNativeStateIds(messages));
    for (const binding of states) {
      const { id: id2 } = binding;
      if (alreadyPresent.has(id2)) continue;
      const artifact = await store.getNativeState(id2);
      if (!artifact)
        throw Object.assign(
          new Error(`neuralese-unknown-native-state: withNativeStates cannot resolve ${id2} from its archive`),
          { code: "neuralese-unknown-native-state" }
        );
      const identity = {
        architecture: artifact.metadata.architecture,
        checkpoint_sha256: artifact.metadata.checkpoint_sha256,
        tokenizer_fingerprint: artifact.metadata.tokenizer_fingerprint,
        embedding_weight_sha256: artifact.metadata.embedding_weight_sha256
      };
      const readerIdentity = {
        architecture: consumer.architecture,
        checkpoint_sha256: consumer.checkpoint_sha256,
        tokenizer_fingerprint: consumer.tokenizer_fingerprint,
        embedding_weight_sha256: consumer.embedding_weight_sha256
      };
      const sourceBaseIdentity = artifact.metadata.adapter_binding?.base_native_identity;
      if (!nativeModelIdentityEqual(identity, readerIdentity) && (!sourceBaseIdentity || !nativeModelIdentityEqual(sourceBaseIdentity, readerIdentity)))
        throw Object.assign(
          new Error(`neuralese-native-state-identity: ${id2} was written by another actor; write or semantically adapt it for the current exact reader`),
          { code: "neuralese-native-state-identity" }
        );
      const sourceOccurrence = binding.source_occurrence ?? activeRecorder()?.nativeStateWriter?.(id2);
      parts.push({
        type: "native_state",
        id: id2,
        ...sourceOccurrence ? { source_occurrence: sourceOccurrence } : {},
        ...binding.stop_gradient ? { stop_gradient: true } : {}
      });
    }
    if (!parts.length) return messages;
    if (!Array.isArray(messages))
      throw Object.assign(
        new Error("neuralese-native-state-prompt: model call has no message list for stored state context"),
        { code: "neuralese-native-state-prompt" }
      );
    return [{ role: "system", content: parts }, ...messages];
  };
  const nativeStateModesFor = async (messages, scope) => {
    const ids = requestNativeStateIds(messages);
    const actualIds = new Set(ids);
    const modes = Object.fromEntries(
      Object.entries(nativeStateModes ?? {}).filter(([id2]) => actualIds.has(id2))
    );
    if (store?.getNativeState) for (const id2 of ids) {
      const artifact = await store.getNativeState(id2);
      if (artifact?.metadata.adapter_binding) modes[id2] = "same-base-adapter-state";
    }
    if ((scope?.adapters ?? activeNativeAdapters()).length) {
      for (const id2 of scope?.softStates ?? activeSoftStates()) if (actualIds.has(id2)) modes[id2] = "same-base-adapter-state";
    }
    return coefficientStateModes(coefficientPolicy, ids, Object.keys(modes).length ? modes : void 0);
  };
  const requireExactNativeImports = (capture, ids, modes) => {
    const imports = capture?.native_state_imports;
    if (!Array.isArray(imports))
      throw Object.assign(
        new Error(`neuralese-native-state-import: server returned no actual native-state import receipt (capture=${capture?.schema ?? "missing"})`),
        { code: "neuralese-native-state-import" }
      );
    const prompt = capture?.prompt;
    if (!Array.isArray(prompt))
      throw Object.assign(
        new Error("neuralese-native-state-import: server returned no exact native prompt occurrence list"),
        { code: "neuralese-native-state-import" }
      );
    for (const id2 of new Set(ids)) {
      const expectedCount = prompt.filter((value) => value && typeof value === "object" && value.kind === "native_state" && value.id === id2).length;
      const receipts = imports.filter((value) => value && typeof value === "object" && value.id === id2);
      const expectedMode = modes?.[id2] ?? "exact-native-state";
      if (!expectedCount || receipts.length !== expectedCount || receipts.some((receipt) => receipt.mode !== expectedMode || receipt.observed_native_state_id !== id2))
        throw Object.assign(
          new Error(`neuralese-native-state-import: server did not consume ${id2} with declared mode ${expectedMode} (imports=${JSON.stringify(imports).slice(0, 1200)})`),
          { code: "neuralese-native-state-import" }
        );
    }
  };
  const transport = async (body, signal, meta) => {
    const scopedNativeStates = activeNativeStates();
    let implicitNativeReadOccurrences = [];
    const capabilities = await serverInfo(scopedNativeStates.length > 0);
    const preexistingStateIds = requestNativeStateIds(materializeNativeStateSentinels(body.messages));
    const implicitStateBindings = scopedNativeStates.filter((state) => !preexistingStateIds.includes(state.id));
    if (scopedNativeStates.length) body = {
      ...body,
      messages: await bindNativeStateContext(body.messages, scopedNativeStates, capabilities)
    };
    const recorder = activeRecorder();
    if (recorder?.nativeStateWriters) body = { ...body, messages: localNativeOccurrences(
      body.messages,
      (id2, occurrence) => recorder.nativeStateWriters(id2).includes(occurrence)
    ) };
    const nativeRecording = (!!recorder || scopedNativeStates.length > 0) && capabilities?.native_state?.enabled === true;
    if (nativeRecording) body = { ...body, x_natlang_native_recording: true };
    if (Array.isArray(capabilities?.capabilities) && capabilities.capabilities.includes("native.protocol-recovery")) body = { ...body, x_natlang_native_protocol_recovery: true };
    if ((body.x_natlang_privileged_context || body.x_natlang_guidance_policy) && !(capabilities && serves(capabilities, "training-guidance")))
      throw Object.assign(new Error("training-guidance-unavailable: this model server does not render training guidance; collect this run through the Python native engine or the SGLang actor"), { code: "training-guidance-unavailable" });
    if (body.guidance && capabilities && !serves(capabilities, "guidance"))
      throw Object.assign(new Error("neuralese-guidance-unavailable: this model server does not implement the requested guidance; use a server with guidance support"), { code: "neuralese-guidance-unavailable" });
    if (body.neuralese_template && body.neuralese_template.optional) {
      const { optional: _optional, ...template } = body.neuralese_template;
      body = { ...body };
      if (capabilities && !serves(capabilities, "template")) delete body.neuralese_template;
      else body.neuralese_template = template;
    }
    if (body.neuralese_template && capabilities) {
      const template = body.neuralese_template;
      const required = [
        "template",
        ...template.value_type ? ["template.value-type"] : [],
        ...template.argument_path ? ["template.argument-path"] : []
      ];
      for (const capability of required) if (!serves(capabilities, capability))
        throw Object.assign(
          new Error(`neuralese-${capability.replaceAll(".", "-")}-unavailable: use a server that implements this typed readout`),
          { code: `neuralese-${capability.replaceAll(".", "-")}-unavailable` }
        );
    }
    const consumptionModes = await nativeStateModesFor(materializeNativeStateSentinels(body.messages));
    if (consumptionModes) body = { ...body, x_natlang_native_state_modes: consumptionModes };
    if (coefficientPolicy) {
      body = { ...body };
      delete body.x_natlang_native_coefficient_policy;
    }
    if (body.x_natlang_adapters?.length && (!capabilities || !serves(capabilities, "native.adapters")))
      throw Object.assign(new Error("neuralese-native-adapters-unavailable: this model server does not apply weight adapters; use a native-state server that lists native.adapters"), { code: "neuralese-native-adapters-unavailable" });
    const adapters = await adapterParts(body.x_natlang_adapters ?? []);
    const inner = (await serverInfo())?.stream === true ? streamed : whole;
    let emitted = false;
    const onDelta = meta?.onDelta && ((delta) => {
      emitted = true;
      meta.onDelta(delta);
    });
    const preparedMessages = materializeNativeStateSentinels(body.messages);
    if (implicitStateBindings.length) {
      const first = preparedMessages[0];
      const parts = Array.isArray(first?.content) ? first.content : [];
      const usedPartIndices = /* @__PURE__ */ new Set();
      const occurrences = implicitStateBindings.flatMap((binding) => {
        const index = parts.findIndex((part2, partIndex) => partIndex >= 0 && !usedPartIndices.has(partIndex) && part2.type === "native_state" && part2.id === binding.id);
        if (index < 0) return [];
        usedPartIndices.add(index);
        const part = parts[index];
        return [{
          id: binding.id,
          positions: [[0, index]],
          ...part.source_occurrence ? { source_occurrence: part.source_occurrence } : {},
          ...part.stop_gradient ? { stop_gradient: true } : {}
        }];
      });
      if (occurrences.length !== implicitStateBindings.length)
        throw Object.assign(
          new Error("neuralese-native-state-import: scoped state was not present at its prepared prompt position"),
          { code: "neuralese-native-state-import" }
        );
      implicitNativeReadOccurrences = occurrences;
    }
    const nativeIds = requestNativeStateIds(preparedMessages);
    const reply = await withRestoredNativeArtifacts(remote, store, adapterArtifactIds(adapters), async () => await withRestoredNativeStates(remote, store, nativeIds, async () => {
      if (onDelta && emitted) {
        onDelta({ type: "reset" });
        emitted = false;
      }
      const requestBody = adapters.length ? { ...body, messages: preparedMessages, x_natlang_adapters: adapters } : { ...body, messages: preparedMessages };
      const answer = await inner(requestBody, signal);
      return isStream(answer) ? await assembleChatCompletion(answer, onDelta) : answer;
    }, nativeUploaded), uploaded);
    if (implicitNativeReadOccurrences.length)
      reply.__natlang_native_read_occurrences = implicitNativeReadOccurrences;
    const rawCapture = reply.x_natlang_rl_capture;
    const nativeStateImports = reply.native_state?.imports;
    if (scopedNativeStates.length && !Array.isArray(nativeStateImports))
      throw Object.assign(
        new Error("neuralese-native-state-import: response lacks the authoritative native_state.imports receipt list"),
        { code: "neuralese-native-state-import" }
      );
    if (Array.isArray(nativeStateImports) && Array.isArray(rawCapture?.native_state_imports) && JSON.stringify(nativeStateImports) !== JSON.stringify(rawCapture.native_state_imports))
      throw Object.assign(
        new Error("neuralese-native-state-import: capture and response native-state receipts disagree"),
        { code: "neuralese-native-state-import" }
      );
    const capture = rawCapture && Array.isArray(nativeStateImports) ? { ...rawCapture, native_state_imports: structuredClone(nativeStateImports) } : rawCapture;
    if (scopedNativeStates.length)
      requireExactNativeImports(capture, scopedNativeStates.map((state) => state.id), consumptionModes);
    const implicitById = /* @__PURE__ */ new Map();
    for (const expected of implicitNativeReadOccurrences) {
      const id2 = expected.id;
      implicitById.set(id2, [...implicitById.get(id2) ?? [], expected]);
    }
    for (const [id2, expected] of implicitById) {
      const promptOccurrences = (capture?.prompt ?? []).filter((segment) => segment.kind === "native_state" && segment.id === id2);
      const importReceipts = (capture?.native_state_imports ?? []).filter((receipt) => receipt.id === id2);
      const sourcesMatch = (actual) => actual.length === expected.length && actual.every((item, index) => item.source_occurrence === expected[index].source_occurrence);
      if (!sourcesMatch(promptOccurrences) || !sourcesMatch(importReceipts))
        throw Object.assign(
          new Error(`neuralese-native-state-import: ${expected.length} prepared occurrence(s) for ${id2} differ from the server prompt and import receipts`),
          { code: "neuralese-native-state-import" }
        );
    }
    const archived = await archiveNeuraleseReplyArtifacts(reply, remote, store, [preparedMessages]);
    const archiveIds = archived.native;
    for (const id2 of archiveIds) nativeUploaded.add(id2);
    if (recorder) {
      const message = reply.choices?.[0]?.message;
      if (nativeRecording && (!capture || !["natlang.native-rl-sampling/1", "natlang.native-rl-sampling/2", "natlang.native-rl-sampling/3", "natlang.native-rl-sampling/4", "natlang.native-structural-capture/1", "natlang.native-structural-capture/2", "natlang.native-teacher-forced-capture/1"].includes(String(capture.schema)) || !Array.isArray(capture.prompt) || !Array.isArray(capture.samples)))
        throw Object.assign(new Error("neuralese-native-grad-invalid: native learning needs the actual server sampling receipt"), { code: "neuralese-native-grad-invalid" });
      if (nativeRecording && archiveIds.size && !store)
        throw Object.assign(new Error("neuralese-native-archive-unavailable: configure a durable native store before recording state communication"), { code: "neuralese-native-archive-unavailable" });
      const native = nativeRecording ? {
        schema: "natlang.native-recorded-turn/1",
        kind: "generation",
        id: `native-turn:${globalThis.crypto.randomUUID()}`,
        sampling: structuredClone(capture),
        retry: meta?.retry ?? 0,
        ...meta?.invocation_id ? { invocation_id: meta.invocation_id } : {}
      } : void 0;
      if (native) reply.x_natlang_native_recorded_turn = native.id;
      const recordingId = native?.id ?? `model-turn:${globalThis.crypto.randomUUID()}`;
      if (message) reply.x_natlang_recorded_turn = recordingId;
      if (message) recorder.record({
        recording_id: recordingId,
        messages: structuredClone(nativeRecording ? preparedMessages : body.messages),
        tools: body.tools ? structuredClone(body.tools) : void 0,
        reply: structuredClone(message),
        blocks: structuredClone(reply.native_state?.blocks ?? []),
        ...adapters.length ? { adapters: [...adapters] } : {},
        ...consumptionModes ? { native_state_modes: { ...consumptionModes } } : {},
        ...native ? { native } : {},
        ...meta?.decision_reasoning ? { decision_reasoning: { ...meta.decision_reasoning } } : {}
      });
    }
    return normalizeReply(reply);
  };
  const request = { ...extra };
  const driver = chatCompletionModelTurn(transport, { request, onExchange, onTurn, adapters: true });
  const scopes = /* @__PURE__ */ new WeakMap();
  const here = () => ({
    recorder: activeRecorder(),
    adapters: activeNativeAdapters(),
    nativeStates: activeNativeStates(),
    softStates: [...activeSoftStates()]
  });
  const scopeOf = (item) => scopes.get(item) ?? here();
  const prepare = async (messages, replies, bound, scope = here(), record2 = false, hints) => {
    const adapters = await adapterParts(bound ?? [], scope.adapters);
    const info2 = await serverInfo(scope.nativeStates.length > 0);
    const native = info2?.native_state;
    const preparedMessages = materializeNativeStateSentinels(await bindNativeStateContext(messages, scope.nativeStates, info2));
    const modes = await nativeStateModesFor(preparedMessages, { adapters: scope.adapters, softStates: scope.softStates });
    if (!native?.enabled) scope.recorder?.record({
      messages: structuredClone(messages),
      reply: { role: "assistant", content: null },
      blocks: [],
      decision: { options: [...replies], ...hints?.open_reply ? { open_reply: true } : {}, ...reasonedFields(hints) },
      ...adapters.length ? { adapters: [...adapters] } : {},
      ...modes ? { native_state_modes: modes } : {}
    });
    return {
      messages: preparedMessages,
      options: [...replies],
      ...adapters.length ? { adapters: [...adapters] } : {},
      ...hints?.cache_messages ? { cache_messages: hints.cache_messages } : {},
      ...hints?.open_reply ? { open_reply: true } : {},
      ...typeof hints?.reasoning === "string" ? { reasoning: hints.reasoning } : {},
      ...hints?.reasoning_sample ? { reasoning_sample: { ...hints.reasoning_sample } } : {},
      ...modes ? { native_state_modes: modes } : {},
      ...native?.enabled && (record2 || scope.recorder || scope.nativeStates.length) ? { native_recording: true } : {}
    };
  };
  const privileged = (item, request2) => {
    const context = request2.x_natlang_privileged_context ?? extra?.x_natlang_privileged_context;
    if (!context) return item;
    if (!request2.invocation_id || !request2.invocation_role)
      throw new Error("privileged-context-invocation: a JOLT+ teacher attempt needs each decision readout's invocation and its root/child role");
    return { ...item, native_recording: true, x_natlang_privileged_context: {
      ...context,
      invocation: { name: request2.invocation_id, role: request2.invocation_role }
    } };
  };
  const finish = async (item, scope, scores) => {
    if (!item.native_recording) return scores;
    const capture = scores.native_decision_capture;
    if (capture?.schema !== "natlang.native-decision-capture/1" || !Array.isArray(capture.prompt) || !Array.isArray(capture.continuations) || capture.continuations.length !== item.options.length)
      throw Object.assign(new Error("neuralese-native-grad-invalid: native decision learning needs its actual rendered continuation receipt"), { code: "neuralese-native-grad-invalid" });
    if (scope.nativeStates.length) requireExactNativeImports(capture, scope.nativeStates.map((state) => state.id), item.native_state_modes);
    if (!scope.recorder) return scores;
    const ids = new Set(requestNativeStateIds(item.messages));
    for (const segment of capture.prompt) if (segment.kind === "native_state") {
      for (const id2 of [segment.id, segment.source_state_id]) if (id2) ids.add(id2);
    }
    for (const receipt of capture.native_state_imports ?? [])
      for (const id2 of [receipt.id, receipt.observed_native_state_id]) if (id2) ids.add(id2);
    if (ids.size && !store) throw Object.assign(new Error("neuralese-native-archive-unavailable: configure a durable native store before recording decision inputs"), { code: "neuralese-native-archive-unavailable" });
    for (const id2 of ids) {
      await archiveNativeArtifactFrom(remote, store, id2);
      nativeUploaded.add(id2);
    }
    const native = {
      schema: "natlang.native-recorded-turn/1",
      kind: "decision",
      id: `native-turn:${globalThis.crypto.randomUUID()}`,
      decision: structuredClone(capture),
      retry: 0
    };
    scope.recorder.record({
      messages: structuredClone(item.messages),
      reply: { role: "assistant", content: null },
      blocks: [],
      decision: { options: [...item.options], ...item.open_reply ? { open_reply: true } : {}, ...reasonedFields(item) },
      ...item.adapters?.length ? { adapters: [...item.adapters] } : {},
      ...item.native_state_modes ? { native_state_modes: { ...item.native_state_modes } } : {},
      native
    });
    return { ...scores, x_natlang_native_recorded_turn: native.id };
  };
  const restore = async (item, run) => withRestoredNativeArtifacts(remote, store, adapterArtifactIds(item.adapters ?? []), () => withRestoredNativeStates(remote, store, requestNativeStateIds(item.messages), run, nativeUploaded), uploaded);
  const issue = async (item, signal) => restore(item, async () => {
    const { reasoning_sample: _sample, ...wire } = item;
    const response = await fetchModel(http.endpoint.replace(/\/$/, "") + "/v1/neuralese/decide", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", ...http.headers },
      body: JSON.stringify(wire)
    });
    if (response.status === 404 || response.status === 501) throw new Error("decision-unsupported: the server does not serve /v1/neuralese/decide");
    if (!response.ok) throw new Error(`neuralese decide HTTP ${response.status}: ${(await response.text()).slice(0, 2e3)}`);
    const scores = await response.json();
    if (item.open_reply && scores.open_reply !== true)
      throw new Error("decision-open-unsupported: the server scored the replies of a field-by-field decision as closed (open_reply not served)");
    if (typeof item.reasoning === "string" && scores.reasoning !== true)
      throw new Error("decision-reasoning-unsupported: the server scored the replies without the reasoning before them (reasoning not served)");
    return scores;
  });
  const guidanceServed = async (item) => {
    if (item.x_natlang_privileged_context && !serves(await serverInfo(false) ?? {}, "training-guidance"))
      throw Object.assign(new Error("training-guidance-unavailable: this model server does not render training guidance; collect this run through the Python native engine or the SGLang actor"), { code: "training-guidance-unavailable" });
    return item;
  };
  const decide = async (request2, signal) => {
    const scope = scopeOf(request2), item = await guidanceServed(privileged(await prepare(request2.messages, request2.options, request2.adapters, scope, request2.native_recording === true, request2), request2));
    return finish(item, scope, await issue(item, signal));
  };
  const perItem = (items, signal) => Promise.allSettled(items.map((item) => issue(item, signal)));
  const batched = explicitBatchScoreMany({ url: http.endpoint.replace(/\/$/, "") + "/v1/natlang/score", headers: http.headers }, perItem);
  const scoreMany = async (items, signal) => {
    const prepared = [], results = new Array(items.length);
    await Promise.all(items.map(async (original, index) => {
      try {
        const scope = scopeOf(original), item = await guidanceServed(privileged(await prepare(original.messages, original.options, original.adapters, scope, original.native_recording === true, original), original));
        await restore(item, async () => ({ log_probs: [] }));
        prepared[index] = { index, item, scope, key: JSON.stringify([item.messages, item.adapters]) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }));
    const order = prepared.filter((entry) => entry !== void 0).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index);
    const info2 = await serverInfo();
    const batch = Array.isArray(info2?.capabilities) ? serves(info2, "score") : true;
    const scored = await (batch ? batched : perItem)(order.map((entry) => entry.item), signal);
    await Promise.all(order.map(async (entry, position) => {
      const result = scored[position];
      if (result.status === "rejected") {
        results[entry.index] = result;
        return;
      }
      try {
        results[entry.index] = { status: "fulfilled", value: await finish(entry.item, entry.scope, result.value) };
      } catch (error) {
        results[entry.index] = { status: "rejected", reason: error };
      }
    }));
    return results;
  };
  const coalesced = coalescingScorer(Object.assign((...args) => decide(...args), { scoreMany }));
  const scoped = Object.assign((request2, signal) => {
    scopes.set(request2, here());
    return coalesced(request2, signal);
  }, { scoreMany: coalesced.scoreMany });
  return Object.assign(driver, {
    neuralese: true,
    artifacts: remote,
    decide: scoped,
    neuraleseRuntime: async () => (await import("./chunk-native-state-client-EYXOKNRV.js")).nativeStateRuntimeOptions(
      { endpoint: http.endpoint, headers: http.headers, store: remote },
      { write: "available" }
    )
  });
}

export {
  setRecorderSource,
  activeRecorder,
  setNativeAdapterSource,
  setNativeStateSource,
  setLexicalSoftStateSource,
  setLexicalNativeAdapterSource,
  activeNativeAdapters,
  activeNativeStates,
  ModelTurnRecorder,
  isNativeAdapterRef,
  nativeAdapterRef,
  isNativeTensorRef,
  nativeTensorRef,
  isTeacherTextNeuraleseId,
  isNativeStateId,
  nativeStateSentinel,
  nativeStateSentinelIds,
  runtimeTextToParts,
  neuraleseRef,
  isNeuraleseRef,
  neuraleseSentinel,
  neuraleseRefSentinel,
  neuraleseDisplayText,
  soleSentinelUse,
  isContentParts,
  partsToText,
  nativeLiteralArguments,
  sourceWithLiteralCalls,
  NeuraleseUnsupportedError,
  NeuraleseNoWriterError,
  isNoNeuraleseWriterFault,
  NeuraleseDialectError,
  nativeStateConsumerFromInfo,
  readerDialect,
  dialectBinding,
  supportsNeuralese,
  supportsGuidance,
  encodeMessages,
  decodeTurnValue,
  isPlainObject,
  canonical,
  nativeProtocolFailure,
  nativeProtocolFeedback,
  SECOND_THINK_CLOSE,
  scoreAll,
  providerErrorBody,
  modelTools,
  chatCompletionModelTurn,
  requestLimit,
  limitedTransport,
  promptLogprobDecider,
  fetchModel,
  openAIEndpointRoot,
  httpChatTransport,
  concurrentScoreMany,
  coalescingScorer,
  explicitBatchScoreMany,
  serves,
  neuraleseServerInfo,
  OWNER_HEADER,
  isUnknownNativeArtifactError,
  restoreNativeArtifacts,
  withRestoredNativeArtifacts,
  HttpNeuraleseStore,
  requestNativeStateIds,
  requestNativeStateBindings,
  materializeNativeStateSentinels,
  restoreNativeStates,
  archiveNeuraleseReplyArtifacts,
  neuraleseServerModelTurn
};
