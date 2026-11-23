import {
  archiveNativeState
} from "./chunk-chunk-WRUGMGG2.js";
import {
  fetchModel
} from "./chunk-chunk-Y6L7V2T3.js";
import {
  hexDigest,
  nativeStateBlockMeta
} from "./chunk-chunk-YDKDWV2X.js";
import "./chunk-chunk-KX6VIJEB.js";

// src/model/native-operator.ts
function grammarCapture(options) {
  const base = options.endpoint.replace(/\/$/, "");
  const headers = { "content-type": "application/json", ...options.headers };
  const markers = options.info.native_state?.role_marker_ids;
  const tokenize = async (content, special) => {
    const response = await fetchModel(`${base}/tokenize`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content, add_special: false, parse_special: special })
    });
    if (!response.ok) throw new Error(`neuralese-native-capture: tokenize failed (${response.status})`);
    return (await response.json()).tokens.map((t) => typeof t === "number" ? t : t.id);
  };
  const detokenize = async (tokens) => {
    const response = await fetchModel(`${base}/detokenize`, { method: "POST", headers, body: JSON.stringify({ tokens }) });
    if (!response.ok) throw new Error(`neuralese-native-capture: detokenize failed (${response.status})`);
    return (await response.json()).content;
  };
  const selectedSpan = async (ids, text) => {
    const ends = [];
    for (let i = 0; i < ids.length; i++) ends.push((await detokenize(ids.slice(0, i + 1))).length);
    const whole = await detokenize(ids);
    for (const spelling of [.../* @__PURE__ */ new Set([text, JSON.stringify(text).slice(1, -1)])]) {
      const first = whole.indexOf(spelling);
      if (first < 0 || whole.indexOf(spelling, first + 1) >= 0) continue;
      return [ends.findIndex((end) => end > first), ends.findIndex((end) => end >= first + spelling.length) + 1];
    }
    throw new Error("neuralese-native-capture: the selected text does not occur exactly once in the reply");
  };
  const applyTemplate = async (call) => {
    const response = await fetchModel(`${base}/apply-template`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: call.messages, ...call.tools.length ? { tools: call.tools } : {} })
    });
    if (!response.ok) throw new Error(`neuralese-native-capture: apply-template failed (${response.status})`);
    return (await response.json()).prompt;
  };
  let specials;
  const single = (ids, name) => {
    if (ids.length !== 1) throw new Error(`neuralese-native-capture: ${name} is not one token on this server`);
    return ids[0];
  };
  return async (call, extra = {}) => {
    if (!Array.isArray(markers) || markers.length !== 4)
      throw new Error("neuralese-native-capture-unavailable: the server declares no native role markers");
    if (!options.store.putNativeState || !options.store.getNativeState)
      throw new Error("neuralese-native-archive-unavailable: captures need a native-capable archive");
    specials ??= (async () => ({
      thinkOpen: single(await tokenize("<think>", true), "<think>"),
      thinkClose: single(await tokenize("</think>", true), "</think>"),
      ends: /* @__PURE__ */ new Set([single(await tokenize("<|im_end|>", true), "<|im_end|>")])
    }))();
    const { thinkOpen, thinkClose, ends } = await specials;
    const reply = call.reply?.length ? call.reply : [...await tokenize(call.reasoning ?? "", false), thinkClose, ...await tokenize(call.text ?? "", false)];
    const end = reply.findIndex((token) => ends.has(token));
    let stop = end < 0 ? reply.length : end;
    let start = reply.slice(0, stop).lastIndexOf(thinkClose) + 1;
    if (call.select !== void 0) [start, stop] = await selectedSpan(reply.slice(0, stop), call.select);
    else if (!start && call.reply?.length && call.prompt?.at(-1) === thinkOpen)
      throw new Error("neuralese-native-capture: the reply ended inside its reasoning: no content to capture");
    const span = reply.slice(start, stop);
    if (!span.length || span.some((token) => markers.includes(token)))
      throw new Error("neuralese-native-capture: the reply has no content to capture, or carries role markers");
    const [open, close] = markers;
    const forced = [...reply.slice(0, start), open, ...span, close];
    const response = await fetchModel(`${base}/v1/chat/completions`, { method: "POST", headers, body: JSON.stringify({
      messages: call.messages,
      ...call.tools.length ? { tools: call.tools } : {},
      temperature: 0,
      max_tokens: forced.length + 1,
      grammar: `root ::= ${forced.map((token) => `<[${token}]>`).join(" ")}`
    }) });
    if (!response.ok) throw new Error(`neuralese-native-capture: forced span failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const result = await response.json();
    const id = result.native_state?.blocks?.[0]?.id;
    if (typeof id !== "string" || result.native_state.blocks.length !== 1)
      throw new Error("neuralese-native-capture: the forced reply did not produce exactly one state");
    const client = { endpoint: options.endpoint, headers: options.headers, store: options.store };
    const imported = [];
    let prompt = [];
    if (call.promptSegments?.length) {
      for (const segment of call.promptSegments) {
        if (segment.kind === "tokens") {
          prompt.push(...segment.token_ids);
          continue;
        }
        const state = await archiveNativeState(client, segment.id);
        imported.push({ at: prompt.length, segment: {
          kind: "native_state",
          id: segment.id,
          token_count: state.tensors.token_ids.shape[0],
          native_identity: {
            checkpoint_sha256: state.metadata.checkpoint_sha256,
            tokenizer_fingerprint: state.metadata.tokenizer_fingerprint,
            embedding_weight_sha256: state.metadata.embedding_weight_sha256,
            architecture: state.metadata.architecture
          }
        } });
      }
    } else prompt = call.prompt?.length ? call.prompt : await tokenize(await applyTemplate(call), true);
    const artifact = await archiveNativeState(client, id);
    const ids = artifact.tensors.token_ids, view = new DataView(ids.data.buffer, ids.data.byteOffset, ids.data.byteLength);
    if (ids.shape[0] !== span.length || span.some((token, index) => BigInt(token) !== view.getBigInt64(index * 8, true)))
      throw new Error("neuralese-native-capture: the produced state does not hold the forced span");
    const prefix = [...prompt, ...reply.slice(0, start), open];
    const text = typeof artifact.metadata.text === "string" ? artifact.metadata.text : "";
    const meta = nativeStateBlockMeta(artifact);
    const segments = [];
    let last = 0, rows = 0;
    for (const { at, segment } of imported) {
      if (at > last) segments.push({ kind: "tokens", token_ids: prefix.slice(last, at), producing: prefix.slice(last, at).map(() => false) });
      segments.push(segment);
      rows += segment.token_count;
      last = at;
    }
    segments.push({ kind: "tokens", token_ids: prefix.slice(last), producing: prefix.slice(last).map(() => false) });
    return { ...meta, ...extra.type ? { type: extra.type } : {}, producer: {
      source_text_sha256: hexDigest(text),
      native_source_capture: {
        policy: {
          checkpoint_sha256: artifact.metadata.checkpoint_sha256,
          tokenizer_fingerprint: artifact.metadata.tokenizer_fingerprint,
          embedding_weight_sha256: artifact.metadata.embedding_weight_sha256,
          architecture: artifact.metadata.architecture
        },
        segments: [
          ...segments,
          { kind: "tokens", token_ids: span, producing: span.map(() => true) },
          { kind: "tokens", token_ids: [close], producing: [false] }
        ],
        payload_start: prefix.length + rows,
        payload_stop: prefix.length + rows + span.length
      }
    } };
  };
}
export {
  grammarCapture
};
