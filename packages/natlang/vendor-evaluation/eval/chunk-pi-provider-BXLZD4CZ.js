import {
  defaultNatlangConfigDirectory,
  piAssistantContent,
  piAssistantToTurn,
  piDeltaTranslator,
  piToolChoiceOptions,
  toPiContext
} from "./chunk-chunk-URFGSJ3U.js";
import "./chunk-chunk-V5SNWGZ5.js";
import "./chunk-chunk-7RHMLU3S.js";
import "./chunk-chunk-WRUGMGG2.js";
import "./chunk-chunk-Y6L7V2T3.js";
import "./chunk-chunk-YDKDWV2X.js";
import "./chunk-chunk-KX6VIJEB.js";

// src/model/pi-provider.ts
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { cleanupSessionResources, defaultProviderAuthContext } from "@earendil-works/pi-ai";
var CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
var REPLY_DIAGNOSTIC_EXCERPT_BYTES = 256;
function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function boundedUtf8Preview(value, limit = 1024) {
  let prefix = "", prefixBytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, "utf8");
    if (prefixBytes + size > limit) break;
    prefix += character;
    prefixBytes += size;
  }
  const tail = [];
  let tailBytes = 0, tailHead = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character, "utf8");
    tail.push({ character, bytes });
    tailBytes += bytes;
    while (tailBytes > limit) tailBytes -= tail[tailHead++].bytes;
    if (tailHead > 128 && tailHead * 2 > tail.length) {
      tail.splice(0, tailHead);
      tailHead = 0;
    }
  }
  return {
    encoding: "final parsed tool arguments JSON string",
    preview_limit_utf8_bytes: limit,
    prefix_utf8: prefix,
    prefix_bytes: prefixBytes,
    tail_utf8: tail.slice(tailHead).map((item) => item.character).join(""),
    tail_bytes: tailBytes,
    truncated: Buffer.byteLength(value, "utf8") > limit
  };
}
function boundedStreamCapture(limit = 1024) {
  let prefix = "", prefixBytes = 0, totalBytes = 0;
  const tail = [];
  let tailBytes = 0, tailHead = 0;
  return {
    push(value) {
      totalBytes += Buffer.byteLength(value, "utf8");
      for (const character of value) {
        const bytes = Buffer.byteLength(character, "utf8");
        if (prefixBytes + bytes <= limit) {
          prefix += character;
          prefixBytes += bytes;
        }
        tail.push({ character, bytes });
        tailBytes += bytes;
        while (tailBytes > limit) tailBytes -= tail[tailHead++].bytes;
        if (tailHead > 128 && tailHead * 2 > tail.length) {
          tail.splice(0, tailHead);
          tailHead = 0;
        }
      }
    },
    finish() {
      return {
        encoding: "concatenated exact streamed tool-call delta text",
        preview_limit_utf8_bytes: limit,
        stream_utf8_bytes: totalBytes,
        prefix_utf8: prefix,
        prefix_bytes: prefixBytes,
        tail_utf8: tail.slice(tailHead).map((item) => item.character).join(""),
        tail_bytes: tailBytes,
        truncated: totalBytes > limit
      };
    }
  };
}
function containsControlCharacter(value) {
  if (typeof value === "string") return CONTROL_CHARACTERS.test(value);
  if (Array.isArray(value)) return value.some(containsControlCharacter);
  if (value && typeof value === "object") return Object.values(value).some(containsControlCharacter);
  return false;
}
function escapedExcerpt(value, maxBytes = REPLY_DIAGNOSTIC_EXCERPT_BYTES) {
  let out = "", used = 0;
  for (const character of value) {
    const escaped = JSON.stringify(character).slice(1, -1);
    const size = Buffer.byteLength(escaped, "utf8");
    if (used + size > maxBytes) break;
    out += escaped;
    used += size;
  }
  return out;
}
function piReplyDiagnostic(reply, visibleText, reasoning, calls) {
  const emptyWithoutAction = visibleText.length === 0 && calls.length === 0;
  const hasControl = containsControlCharacter(reply.content);
  if (!emptyWithoutAction && !hasControl) return;
  const contentJson = JSON.stringify(reply.content);
  return {
    version: "pi-sdk-parsed-reply-diagnostic/1",
    source: "pi-sdk-assistant-message-content",
    sdk_stop_reason: reply.stopReason,
    usage_input_tokens: reply.usage.input,
    usage_output_tokens: reply.usage.output,
    visible_text_empty: visibleText.length === 0,
    visible_text_utf8_bytes: Buffer.byteLength(visibleText, "utf8"),
    visible_text_sha256: sha256Text(visibleText),
    reasoning_present: reasoning.length > 0,
    reasoning_utf8_bytes: Buffer.byteLength(reasoning, "utf8"),
    tool_call_count: calls.length,
    content_block_count: reply.content.length,
    content_block_types: reply.content.slice(0, 32).map((block) => block.type),
    parsed_sdk_content_sha256: sha256Text(contentJson),
    control_character_present: hasControl,
    ...hasControl ? { parsed_sdk_content_excerpt_escaped: escapedExcerpt(contentJson) } : {},
    ...visibleText.length && CONTROL_CHARACTERS.test(visibleText) ? { visible_text_excerpt_escaped: escapedExcerpt(visibleText) } : {},
    ...reasoning.length && CONTROL_CHARACTERS.test(reasoning) ? { reasoning_excerpt_escaped: escapedExcerpt(reasoning) } : {}
  };
}
var FileCredentials = class {
  constructor(directory) {
    this.directory = directory;
  }
  directory;
  path(id) {
    return join(this.directory, `${encodeURIComponent(id)}.json`);
  }
  async read(id) {
    try {
      return JSON.parse(await readFile(this.path(id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }
  async list() {
    try {
      const files = await readdir(this.directory);
      const rows = await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
        const providerId = decodeURIComponent(file.slice(0, -5));
        const credential = await this.read(providerId);
        return credential ? { providerId, type: credential.type } : null;
      }));
      return rows.filter((row) => row !== null);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
  async locked(id, action) {
    await mkdir(this.directory, { recursive: true, mode: 448 });
    const lock = `${this.path(id)}.lock`;
    const deadline = Date.now() + 3e4;
    while (true) {
      try {
        await mkdir(lock);
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          if (Date.now() - (await stat(lock)).mtimeMs > 6e5) await rm(lock, { recursive: true });
        } catch (failure) {
          if (failure.code !== "ENOENT") throw failure;
        }
        if (Date.now() >= deadline) throw new Error(`timed out waiting for credential lock for ${id}`);
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
    }
    try {
      return await action();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  async modify(id, fn) {
    return this.locked(id, async () => {
      const current = await this.read(id), next = await fn(current);
      if (next === void 0) return current;
      const temporary = `${this.path(id)}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(next), { mode: 384, flag: "wx" });
        await rename(temporary, this.path(id));
      } finally {
        await rm(temporary, { force: true });
      }
      return next;
    });
  }
  async delete(id) {
    await this.locked(id, async () => {
      await rm(this.path(id), { force: true });
    });
  }
};
function piCredentials(environment = process.env) {
  return new FileCredentials(join(defaultNatlangConfigDirectory(environment), "credentials"));
}
function piModels(environment = process.env, scopedEnv = {}) {
  const base = defaultProviderAuthContext();
  return builtinModels({
    credentials: new FileCredentials(join(defaultNatlangConfigDirectory(environment), "credentials")),
    authContext: { env: async (name) => {
      const value = scopedEnv[name] ?? environment[name];
      return typeof value === "string" && value.trim() ? value : void 0;
    }, fileExists: base.fileExists }
  });
}
function record(value, label) {
  if (value === void 0) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}
function createPiModelBackend(provider, modelId, environment = process.env, apiKeyEnv, headers, piOptions, modelOptions, mode = "native", piPayload, injectedModels) {
  if (!["native", "simple"].includes(mode)) throw new Error("Pi mode must be native or simple");
  const modelOverride = record(modelOptions, "modelOptions");
  const requestOverride = record(piOptions, "piOptions");
  const payloadOverride = record(piPayload, "piPayload");
  const scopedEnv = record(requestOverride.env, "piOptions.env");
  for (const [name, value] of Object.entries(scopedEnv)) if (typeof value !== "string")
    throw new TypeError(`piOptions.env.${name} must be a string`);
  const models = injectedModels ?? piModels(environment, scopedEnv);
  if (!models.getProvider(provider)) throw new Error(`Pi has no provider ${provider}; run natlang models`);
  for (const key of ["id", "provider", "api"]) if (Object.hasOwn(modelOverride, key))
    throw new Error(`modelOptions cannot override ${key}; select a different provider or model instead`);
  const templateId = modelOverride.inherit;
  if (templateId !== void 0 && (typeof templateId !== "string" || !templateId))
    throw new Error("modelOptions.inherit must name a model in the selected provider catalog");
  const { inherit: _inherit, ...modelSettings } = modelOverride;
  if (requestOverride.maxTokens !== void 0 && (!Number.isSafeInteger(requestOverride.maxTokens) || Number(requestOverride.maxTokens) < 1))
    throw new Error("piOptions.maxTokens must be a positive integer");
  if (requestOverride.deferred) throw new Error("piOptions.deferred needs a deferred-result driver and is not supported by natlang turns");
  let model;
  const selectModel = async () => {
    if (model) return model;
    let selected = models.getModel(provider, modelId);
    if (!selected) {
      const refreshed = await models.refresh({ providers: [provider] });
      const failure = refreshed.errors.get(provider);
      if (failure) throw new Error(`could not refresh ${provider} models: ${failure.message}`, { cause: failure });
      selected = models.getModel(provider, modelId);
    }
    if (!selected && templateId) selected = models.getModel(provider, templateId);
    if (!selected) throw new Error(`Pi has no model ${provider}/${modelId}; run natlang models ${provider} --refresh or set modelOptions.inherit`);
    model = {
      ...selected,
      id: modelId,
      ...modelSettings,
      headers: { ...selected.headers, ...record(modelSettings.headers, "modelOptions.headers") },
      samplingParams: { ...selected.samplingParams, ...record(modelSettings.samplingParams, "modelOptions.samplingParams") }
    };
    return model;
  };
  return {
    async prepare() {
      if (!await models.getAuth(provider, {
        ...apiKeyEnv && environment[apiKeyEnv] ? { apiKey: environment[apiKeyEnv] } : {},
        env: scopedEnv
      }))
        throw new Error(`provider ${provider} has no credentials; run natlang auth login ${provider} or set its API key environment variable`);
      await selectModel();
    },
    async turn(request, signal, turnOptions = {}) {
      const { onProgress, onDelta } = turnOptions;
      signal?.throwIfAborted();
      const model2 = await selectModel();
      const context = toPiContext(request, model2);
      const configuredMax = requestOverride.maxTokens;
      const maxTokens = request.max_tokens === null ? configuredMax : configuredMax === void 0 ? request.max_tokens : Math.min(request.max_tokens, configuredMax);
      const options = {
        ...requestOverride,
        ...signal ? { signal } : {},
        // Codex Responses rejects temperature, including natlang's usual zero default.
        ...request.temperature === void 0 || model2.api === "openai-codex-responses" ? {} : { temperature: request.temperature },
        ...maxTokens === void 0 ? {} : { maxTokens },
        samplingParams: {
          ...record(requestOverride.samplingParams, "piOptions.samplingParams"),
          ...request.seed === null ? {} : { seed: request.seed }
        },
        headers: { ...record(requestOverride.headers, "piOptions.headers"), ...headers },
        ...Object.keys(payloadOverride).length || model2.api === "openai-codex-responses" && maxTokens !== void 0 ? { onPayload: async (payload, providerModel) => {
          const hook = requestOverride.onPayload;
          const transformed = typeof hook === "function" ? await hook(payload, providerModel) : void 0;
          return {
            ...record(transformed ?? payload, "provider request payload"),
            ...payloadOverride,
            // Pi's Codex Responses adapter currently omits maxTokens from its request body.
            // The collector's action ceiling must reach the provider for long tool calls.
            ...model2.api === "openai-codex-responses" && maxTokens !== void 0 ? { max_output_tokens: Math.max(maxTokens, 16) } : {}
          };
        } } : {},
        ...piToolChoiceOptions(model2.api, request),
        ...apiKeyEnv && environment[apiKeyEnv] ? { apiKey: environment[apiKeyEnv] } : {}
      };
      const stream = mode === "simple" && request.tool_choice !== "required" ? models.streamSimple(model2, context, options) : models.stream(model2, context, options);
      const started = Date.now(), startedAt = new Date(started).toISOString();
      const counts = {
        deltaEvents: 0,
        deltaBytes: 0,
        textDeltaEvents: 0,
        textDeltaBytes: 0,
        thinkingDeltaEvents: 0,
        thinkingDeltaBytes: 0,
        toolCallDeltaEvents: 0,
        toolCallDeltaBytes: 0
      };
      const deltaFingerprints = /* @__PURE__ */ new Map();
      const MAX_TRACKED_DELTA_FINGERPRINTS = 4096;
      let untrackedDeltaEvents = 0, adjacentDuplicateDeltaEvents = 0;
      let previousDeltaFingerprint = "", currentRepeatRun = 0, longestRepeatRun = 0;
      const toolDeltaPreview = boundedStreamCapture(1024);
      const emit = (status) => {
        if (!onProgress) return;
        const progress = {
          status,
          ...counts,
          startedAt,
          observedAt: (/* @__PURE__ */ new Date()).toISOString(),
          elapsedMs: Date.now() - started
        };
        try {
          onProgress(progress);
        } catch {
        }
      };
      let lastEmitted = 0;
      const finalMessage = stream.result();
      void finalMessage.catch(() => void 0);
      let reply, turn;
      const deltaOf = piDeltaTranslator();
      try {
        for await (const event of stream) {
          if (onDelta) {
            const delta2 = deltaOf(event);
            if (delta2) {
              try {
                onDelta(delta2);
              } catch {
              }
            }
          }
          let kind;
          let delta;
          if (event.type === "text_delta") {
            kind = "text";
            delta = event.delta;
          } else if (event.type === "thinking_delta") {
            kind = "thinking";
            delta = event.delta;
          } else if (event.type === "toolcall_delta") {
            kind = "toolcall";
            delta = event.delta;
          }
          if (!kind || !delta) continue;
          const bytes = Buffer.byteLength(delta, "utf8");
          if (!bytes) continue;
          counts.deltaEvents++;
          counts.deltaBytes += bytes;
          if (kind === "text") {
            counts.textDeltaEvents++;
            counts.textDeltaBytes += bytes;
          } else if (kind === "thinking") {
            counts.thinkingDeltaEvents++;
            counts.thinkingDeltaBytes += bytes;
          } else {
            counts.toolCallDeltaEvents++;
            counts.toolCallDeltaBytes += bytes;
            toolDeltaPreview.push(delta);
            const fingerprint = sha256Text(delta), prior = deltaFingerprints.get(fingerprint);
            if (prior) {
              prior.occurrences++;
            } else if (deltaFingerprints.size < MAX_TRACKED_DELTA_FINGERPRINTS)
              deltaFingerprints.set(fingerprint, { occurrences: 1, utf8Bytes: bytes });
            else untrackedDeltaEvents++;
            if (fingerprint === previousDeltaFingerprint) {
              adjacentDuplicateDeltaEvents++;
              currentRepeatRun++;
            } else {
              previousDeltaFingerprint = fingerprint;
              currentRepeatRun = 1;
            }
            longestRepeatRun = Math.max(longestRepeatRun, currentRepeatRun);
          }
          const now = Date.now();
          if (lastEmitted === 0 || now - lastEmitted >= 15e3) {
            emit("progress");
            lastEmitted = now;
          }
        }
        reply = await finalMessage;
        turn = piAssistantToTurn(reply, provider);
        emit("completed");
      } catch (error) {
        emit("failed");
        throw error;
      }
      const { calls, text, reasoning, rawCalls: raw_calls } = piAssistantContent(reply);
      const replyDiagnostic = piReplyDiagnostic(reply, text, reasoning, calls);
      const piStreamObservation = {
        version: "pi-stream-final-comparison/1",
        streamed_delta_events: counts.deltaEvents,
        streamed_delta_utf8_bytes: counts.deltaBytes,
        streamed_tool_call_delta_events: counts.toolCallDeltaEvents,
        streamed_tool_call_delta_utf8_bytes: counts.toolCallDeltaBytes,
        streamed_text_delta_utf8_bytes: counts.textDeltaBytes,
        streamed_thinking_delta_utf8_bytes: counts.thinkingDeltaBytes,
        streamed_tool_call_delta_preview: toolDeltaPreview.finish(),
        final_call_count: raw_calls.length,
        final_raw_calls_json_utf8_bytes: Buffer.byteLength(JSON.stringify(raw_calls), "utf8"),
        final_calls: raw_calls.map((call, index) => ({
          index,
          name: call.function.name,
          arguments_utf8_bytes: Buffer.byteLength(call.function.arguments, "utf8"),
          arguments_sha256: sha256Text(call.function.arguments),
          arguments_preview: boundedUtf8Preview(call.function.arguments)
        })),
        tool_delta_repetition: {
          fingerprint: "sha256 of exact delta string; frequency alone does not establish repetitive generated content because short/common tokens repeat naturally",
          unique_fingerprint_limit: MAX_TRACKED_DELTA_FINGERPRINTS,
          tracked_unique_fingerprints: deltaFingerprints.size,
          untracked_delta_events_after_limit: untrackedDeltaEvents,
          repeated_events_within_tracked_fingerprints: [...deltaFingerprints.values()].reduce((sum, item) => sum + Math.max(0, item.occurrences - 1), 0),
          interpretation_limit: "Repeated hashes summarize exact event strings; common short chunks can recur in ordinary output. Inspect the bounded stream prefix/tail and adjacent-repeat run before interpreting them.",
          adjacent_duplicate_events: adjacentDuplicateDeltaEvents,
          longest_adjacent_repeat_run: longestRepeatRun,
          top_repeated_fingerprints: [...deltaFingerprints.entries()].filter(([, item]) => item.occurrences > 1).sort((a, b) => b[1].occurrences - a[1].occurrences || a[0].localeCompare(b[0])).slice(0, 8).map(([sha256, item]) => ({
            sha256,
            occurrences: item.occurrences,
            delta_utf8_bytes: item.utf8Bytes
          }))
        },
        comparison_scope: "stream delta byte totals vs final parsed sdk call arguments; no delta-to-call identity asserted"
      };
      return { ...turn, raw_response: {
        provider,
        model: modelId,
        ...turn.raw_response,
        pi_stream_observation: piStreamObservation,
        ...replyDiagnostic ? { pi_reply_diagnostic: replyDiagnostic } : {}
      } };
    },
    close() {
      if (typeof requestOverride.sessionId === "string") cleanupSessionResources(requestOverride.sessionId);
    }
  };
}
export {
  createPiModelBackend,
  piCredentials,
  piModels
};
