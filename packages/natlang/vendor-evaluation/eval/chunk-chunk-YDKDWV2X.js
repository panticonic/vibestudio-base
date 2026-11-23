// src/native/hash.ts
import { sha256 } from "@noble/hashes/sha2.js";
function digest(text) {
  return sha256(typeof text === "string" ? new TextEncoder().encode(text) : text);
}
function hexDigest(text) {
  return Array.from(digest(text), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/native/native-derivative-contract.ts
var ID = /^(?:nzs1_|nnt1_)[a-z2-7]{52}$/;
var TENSOR = /^nnt1_[a-z2-7]{52}$/;
var STATE = /^nzs1_[a-z2-7]{52}$/;
var DERIVATION = "natlang.native-state-derivation/1";
var keys = (value) => Object.keys(value).sort().join(",");
var sortedUnique = (value, pattern) => Array.isArray(value) && value.every((item) => typeof item === "string" && pattern.test(item)) && value.join(",") === [...new Set(value)].sort().join(",");
function hexNumber(text) {
  if (typeof text !== "string") throw new RangeError("native optimizer options require canonical hexadecimal values");
  if (/^-?0x0\.0p\+0$/.test(text)) return text.startsWith("-") ? -0 : 0;
  const match = /^(-?)0x([01])\.([0-9a-f]{13})p([+-]\d+)$/.exec(text);
  if (!match) throw new RangeError("native optimizer options require canonical hexadecimal values");
  const exponent = Number(match[4]);
  if (match[4] !== `${exponent >= 0 ? "+" : ""}${exponent}` || exponent < -1022 || exponent > 1023 || match[2] === "0" && (exponent !== -1022 || Number.parseInt(match[3], 16) === 0))
    throw new RangeError("native optimizer options require canonical finite hexadecimal values");
  return (match[1] ? -1 : 1) * (Number(match[2]) + Number.parseInt(match[3], 16) / 2 ** 52) * 2 ** exponent;
}
function validateNativeOptimizerBinding(value) {
  if (!value || keys(value) !== "beta1_hex,beta2_hex,eps_hex,learning_rate_hex,momentum_hex,name,weight_decay_hex" || !["adam", "sgd"].includes(value.name))
    throw new RangeError("native optimizer needs its exact named algorithm/settings binding");
  const lr = hexNumber(value.learning_rate_hex), decay = hexNumber(value.weight_decay_hex), b1 = hexNumber(value.beta1_hex), b2 = hexNumber(value.beta2_hex), eps = hexNumber(value.eps_hex), momentum = hexNumber(value.momentum_hex);
  if (!(lr > 0 && decay >= 0 && b1 >= 0 && b1 < 1 && b2 >= 0 && b2 < 1 && eps > 0 && momentum >= 0)) throw new RangeError("native optimizer settings are out of range");
}
function nativeOptimizerOptions(value) {
  validateNativeOptimizerBinding(value);
  return { name: value.name, ...Object.fromEntries(["learning_rate", "weight_decay", "beta1", "beta2", "eps", "momentum"].map((key) => [key, hexNumber(value[key + "_hex"])])) };
}
function validateNativeStateDerivation(value) {
  if (value === void 0) return;
  if (!value || value.kind !== "optimizer" || keys(value) !== "arithmetic,gradient_id,kind,optimizer,optimizer_state_parent_id,origin_state_ids,parent_state_id,program_id,schema,step,update_artifact_id,updated_tensor_names" || value.schema !== DERIVATION || value.kind !== "optimizer" || !STATE.test(value.parent_state_id) || !TENSOR.test(value.gradient_id) || !TENSOR.test(value.update_artifact_id) || value.program_id !== null && !TENSOR.test(value.program_id) || value.optimizer_state_parent_id !== null && !TENSOR.test(value.optimizer_state_parent_id) || !Number.isSafeInteger(value.step) || value.step < 1 || !sortedUnique(value.origin_state_ids, STATE) || !value.origin_state_ids.length || !sortedUnique(value.updated_tensor_names, /^layers\.[0-9]+\.(?:raw_k|v|gated_inputs|mixed_qkv|z|b|a)$/) || !value.updated_tensor_names.length)
    throw new RangeError("native optimized state needs its exact origin/update/history contract");
  validateNativeOptimizerBinding(value.optimizer);
  const arithmetic = value.arithmetic;
  if (!arithmetic || keys(arithmetic) !== "cpu_capability,float32_subnormal_hex,implementation_sha256,libc_version,machine,python_version,schema,torch_build_sha256,torch_git_version,torch_version" || arithmetic.schema !== "natlang.native-state-optimizer-torch-cpu/1" || Object.values(arithmetic).some((value2) => typeof value2 !== "string" || !value2) || ["implementation_sha256", "torch_build_sha256"].some((key) => !/^[0-9a-f]{64}$/.test(arithmetic[key])))
    throw new RangeError("native state optimizer needs its exact qualified CPU implementation/runtime binding");
}
function nativeStateDerivationDependencies(value) {
  validateNativeStateDerivation(value);
  return value ? [.../* @__PURE__ */ new Set([
    ...value.origin_state_ids,
    value.parent_state_id,
    value.gradient_id,
    value.update_artifact_id,
    ...[value.program_id, value.optimizer_state_parent_id].filter((id) => id !== null)
  ])].sort() : [];
}
function finiteProgramDependencies(value) {
  const object = (item) => !!item && typeof item === "object" && !Array.isArray(item);
  const fail = () => {
    throw new RangeError("native derivative program has invalid finite topology or executable dependencies");
  };
  if (!object(value) || !["arithmetic,inputs,nodes,outer,schema,wrt", "arithmetic,inputs,nodes,order,outer,schema,wrt"].includes(keys(value)) || value.order !== void 0 && value.order !== 1 && value.order !== 2 || value.schema !== "natlang.native-derivative-program/1") return fail();
  const arithmetic = value.arithmetic;
  if (!object(arithmetic) || keys(arithmetic) !== "query_chunk_tokens,schema" || arithmetic.schema !== "natlang.native-reference-arithmetic/1" || !Number.isSafeInteger(arithmetic.query_chunk_tokens) || arithmetic.query_chunk_tokens < 1) return fail();
  const roots = value.inputs, nodes = value.nodes, wrt = value.wrt;
  if (!object(roots) || !Object.keys(roots).length || Object.keys(roots).some((name) => !name) || !Array.isArray(nodes) || !Array.isArray(wrt) || !wrt.length || wrt.some((name) => typeof name !== "string" || !Object.hasOwn(roots, name)) || new Set(wrt).size !== wrt.length) return fail();
  const kinds = /* @__PURE__ */ new Map(), available = /* @__PURE__ */ new Map(), names = /* @__PURE__ */ new Set(), gradients = /* @__PURE__ */ new Map(), deps = /* @__PURE__ */ new Set();
  for (const [name, target] of Object.entries(roots)) {
    if (!object(target) || Object.keys(target).some((key) => !["kind", "id", "names"].includes(key)) || !["adapter", "native-state", "model-parameters"].includes(target.kind) || typeof target.id !== "string" || !(target.kind === "native-state" ? STATE : TENSOR).test(target.id)) return fail();
    if (target.names !== void 0 || target.kind === "model-parameters") {
      if (!Array.isArray(target.names) || !target.names.length || target.names.some((name2) => typeof name2 !== "string" || !name2) || new Set(target.names).size !== target.names.length) return fail();
    }
    kinds.set(name, target.kind);
    available.set(name, target.kind);
    names.add(name);
    deps.add(target.id);
  }
  const objective = (item) => {
    if (!object(item) || keys(item) !== "bindings,request" || !object(item.bindings) || !object(item.request)) return fail();
    for (const [name, current] of Object.entries(item.bindings)) if (!kinds.has(name) || typeof current !== "string" || available.get(current) !== kinds.get(name)) return fail();
    const request = item.request;
    if (request.schema === "natlang.native-recorded-objective-request/1") {
      if (keys(request) !== "events,native_state_modes,schema,targets,terms,turns" && keys(request) !== "events,schema,targets,terms,turns") return fail();
      if (!Array.isArray(request.turns) || !Array.isArray(request.events) || !Array.isArray(request.terms) || !Array.isArray(request.targets) || !request.targets.length || request.native_state_modes !== void 0 && !object(request.native_state_modes)) return fail();
      const rootsForRequest = /* @__PURE__ */ new Set();
      for (const target of request.targets) {
        if (!object(target) || Object.keys(target).some((key) => !["root", "kind", "id", "names"].includes(key)) || typeof target.root !== "string" || rootsForRequest.has(target.root) || !kinds.has(target.root) || kinds.get(target.root) !== target.kind || typeof target.id !== "string" || target.id !== roots[target.root].id || !(target.kind === "native-state" ? STATE : TENSOR).test(target.id)) return fail();
        const current = item.bindings[target.root] ?? target.root;
        if (typeof current !== "string" || available.get(current) !== target.kind) return fail();
        if (target.names !== void 0 && (!Array.isArray(target.names) || !target.names.length || target.names.some((name) => typeof name !== "string" || !name) || new Set(target.names).size !== target.names.length)) return fail();
        rootsForRequest.add(target.root);
      }
      const collect = (entry) => {
        if (typeof entry === "string") {
          if (TENSOR.test(entry) || STATE.test(entry)) deps.add(entry);
        } else if (Array.isArray(entry)) entry.forEach(collect);
        else if (object(entry)) Object.values(entry).forEach(collect);
      };
      collect(request);
    } else {
      const graph = request.graph;
      if (request.schema !== "natlang.native-gradient-request/1" || ["target", "order", "derived", "create_graph"].some((key) => Object.hasOwn(request, key)) || !object(graph) || object(request.objective) && request.objective.kind !== "native-query") return fail();
      for (const id of nativeQueryReadoutDependencies(request.objective)) deps.add(id);
      const invocation = request.invocation_adapters;
      if (invocation !== void 0 && !object(invocation)) return fail();
      for (const entries of [request.adapters ?? [], ...Object.values(invocation ?? {})]) {
        if (!Array.isArray(entries)) return fail();
        for (const entry of entries) {
          const id = typeof entry === "string" ? entry : object(entry) ? entry.id : void 0;
          if (typeof id !== "string" || !TENSOR.test(id)) return fail();
          deps.add(id);
        }
      }
      if (graph.external_states !== void 0 && !object(graph.external_states)) return fail();
      for (const state of Object.values(graph.external_states ?? {})) {
        if (!object(state) || typeof state.id !== "string" || !STATE.test(state.id)) return fail();
        deps.add(state.id);
      }
    }
  };
  for (const node of nodes) {
    if (!object(node) || typeof node.name !== "string" || !node.name || names.has(node.name)) return fail();
    if (node.kind === "gradient") {
      const targets = node.targets;
      if (keys(node) === "bindings,kind,name,request,value") {
        if (typeof node.value !== "string" || !available.has(node.value)) return fail();
      } else if (keys(node) === "bindings,kind,name,request,targets") {
        if (!Array.isArray(targets) || !targets.length || targets.some((target) => !object(target) || keys(target) !== "name,value" || typeof target.name !== "string" || !target.name || typeof target.value !== "string" || !available.has(target.value))) return fail();
      } else return fail();
      objective({ request: node.request, bindings: node.bindings });
      const gradientTargets = Array.isArray(targets) ? targets : [{ name: node.name, value: node.value }];
      const request = node.request;
      if (request.schema === "natlang.native-recorded-objective-request/1") {
        const objectiveTargets = request.targets;
        const aliases = /* @__PURE__ */ new Set(), covered = /* @__PURE__ */ new Set();
        for (const target of gradientTargets) {
          if (names.has(target.name) || aliases.has(target.name)) return fail();
          const matches = objectiveTargets.filter((rootTarget) => (node.bindings[rootTarget.root] ?? rootTarget.root) === target.value);
          if (matches.length !== 1 || covered.has(matches[0].root)) return fail();
          aliases.add(target.name);
          covered.add(matches[0].root);
          gradients.set(target.name, target.value);
        }
        if (covered.size !== objectiveTargets.length) return fail();
      } else {
        if (gradientTargets.length !== 1 || !Object.keys(roots).some((name) => (node.bindings[name] ?? name) === gradientTargets[0].value)) return fail();
        if (Array.isArray(targets)) gradients.set(targets[0].name, targets[0].value);
        else gradients.set(node.name, gradientTargets[0].value);
      }
    } else if (node.kind === "optimizer") {
      if (!["gradient,kind,name,optimizer,optimizer_state,value", "gradient,kind,name,optimizer,optimizer_state,recorded,value"].includes(keys(node)) || node.recorded !== void 0 && (typeof node.recorded !== "string" || !(STATE.test(node.recorded) || TENSOR.test(node.recorded))) || typeof node.value !== "string" || !available.has(node.value) || typeof node.gradient !== "string" || gradients.get(node.gradient) !== node.value || !object(node.optimizer) || Object.keys(node.optimizer).some((key) => !["name", "learning_rate", "weight_decay", "beta1", "beta2", "eps", "momentum"].includes(key)) || !["sgd", "adam"].includes(node.optimizer.name)) return fail();
      const settings = { learning_rate: 1e-3, weight_decay: 0, beta1: 0.9, beta2: 0.999, eps: 1e-8, momentum: 0, ...node.optimizer };
      if (Object.entries(settings).some(([key, item]) => key !== "name" && (typeof item !== "number" || !Number.isFinite(item))) || !(settings.learning_rate > 0 && settings.weight_decay >= 0 && settings.beta1 >= 0 && settings.beta1 < 1 && settings.beta2 >= 0 && settings.beta2 < 1 && settings.eps > 0 && settings.momentum >= 0)) return fail();
      const history = node.optimizer_state;
      if (history !== null && (history !== node.value && (typeof history !== "string" || !TENSOR.test(history)) || history === node.value && Object.hasOwn(roots, history))) return fail();
      available.set(node.name, available.get(node.value));
    } else return fail();
    names.add(node.name);
  }
  objective(value.outer);
  return [...deps].sort();
}
function validateNativeDerivativeArtifact(value) {
  if (!value || !["natlang.native-derivative-program/1", "natlang.native-derivative-execution/1"].includes(value.schema) || !sortedUnique(value.dependencies, ID)) throw new RangeError("native derivative artifact needs its declared sorted dependency inventory");
  if (value.schema === "natlang.native-derivative-program/1") {
    if (typeof value.program_json !== "string" || hexDigest(value.program_json) !== value.program_sha256 || JSON.stringify(finiteProgramDependencies(JSON.parse(value.program_json))) !== JSON.stringify(value.dependencies))
      throw new RangeError("native derivative program differs from its exact immutable JSON/dependency binding");
  } else if (typeof value.program_id !== "string" || !TENSOR.test(value.program_id)) throw new RangeError("native derivative execution needs its exact program artifact");
}
function validateNativeDerivativeTarget(metadata, tensors) {
  const provenance = metadata.provenance, value = provenance.native_derivative_target;
  if (value === void 0) return false;
  const kind = { "adapter-gradient": "adapter", "state-gradient": "native-state", "parameter-gradient": "model-parameters" }[metadata.kind];
  if (!value || keys(value) !== "kind,names,schema,stage,value_id,variable" || value.schema !== "natlang.native-derivative-target/1" || !["inner", "outer"].includes(value.stage) || typeof value.variable !== "string" || !value.variable || value.kind !== kind || typeof provenance.derivative_program_id !== "string" || !TENSOR.test(provenance.derivative_program_id) || value.stage === "outer" && (typeof provenance.derivative_execution_id !== "string" || !TENSOR.test(provenance.derivative_execution_id)) || value.value_id !== (kind === "model-parameters" ? provenance.parameter_value_id : metadata.source_artifact_id) || typeof value.value_id !== "string" || !(kind === "native-state" ? STATE : TENSOR).test(value.value_id) || JSON.stringify(value.names) !== JSON.stringify(Object.keys(tensors).sort())) throw new RangeError("native derivative gradient needs its exact differentiation origin");
  return true;
}
function validateNativeFunctionalActor(metadata, canonical) {
  const provenance = metadata.provenance, actor = provenance.functional_actor;
  if (actor === void 0) return;
  if (!actor || keys(actor) !== "arithmetic,base_native_identity,invocation_adapters,parameter_values,schema,uniform_adapters" || actor.schema !== "natlang.native-functional-actor/1" || canonical(actor.base_native_identity) !== canonical(metadata.native_identity) || hexDigest(canonical(actor)) !== provenance.functional_actor_sha256 || !Array.isArray(actor.parameter_values))
    throw new RangeError("native functional actor needs exact base, overlays and arithmetic identity");
  const names = /* @__PURE__ */ new Set(), ids = [];
  for (const entry of actor.parameter_values) {
    if (!entry || keys(entry) !== "id,names" || !TENSOR.test(entry.id) || !Array.isArray(entry.names) || !entry.names.length || entry.names.some((name) => typeof name !== "string" || !name || names.has(name)) || JSON.stringify(entry.names) !== JSON.stringify([...new Set(entry.names)].sort()))
      throw new RangeError("native functional actor has invalid or overlapping exact parameter overlays");
    ids.push(entry.id);
    entry.names.forEach((name) => names.add(name));
  }
  if (JSON.stringify(ids) !== JSON.stringify([...new Set(ids)].sort())) throw new RangeError("native functional overlays must be unique ordered artifacts");
  const arith = actor.arithmetic, chunk = arith?.query_chunk_tokens;
  const expected = {
    schema: "natlang.native-reference-arithmetic/1",
    native_projection_product_dtype: "float64",
    stock_torch_modules: "source-dtype/differentiable",
    adapter_delta: "stored-base-plus-unrounded-float32",
    optimizer_adam_zero_moment_tangent: "zero-v-boundary/finite-valid-history",
    activation_storage: "source-native",
    attention: "exact-visible-softmax",
    expert_dispatch: "source-top-k/differentiable-selected-weights",
    query_chunk_tokens: chunk
  };
  if (!Number.isSafeInteger(chunk) || chunk < 1 || canonical(arith) !== canonical(expected)) throw new RangeError("native functional actor requires complete reference arithmetic");
  if (!Array.isArray(actor.uniform_adapters) || actor.invocation_adapters !== null && (!actor.invocation_adapters || typeof actor.invocation_adapters !== "object" || Array.isArray(actor.invocation_adapters) || !Object.keys(actor.invocation_adapters).length || actor.uniform_adapters.length))
    throw new RangeError("native functional actor needs uniform or per-invocation coefficients");
  for (const entries of [actor.uniform_adapters, ...Object.values(actor.invocation_adapters ?? {})]) {
    if (!Array.isArray(entries)) throw new RangeError("native functional coefficients need ordered declarations");
    for (const entry of entries) {
      if (!entry || keys(entry) !== "id,scale_hex" || !TENSOR.test(entry.id)) throw new RangeError("native functional coefficients need exact IDs/scales");
      hexNumber(entry.scale_hex);
    }
  }
  if (!actor.parameter_values.length) {
    const binding = provenance.adapter_binding;
    const receipt = provenance.invocation_actors;
    const actual = receipt ? Object.fromEntries(Object.entries(receipt.invocations).map(([name, value]) => [name, value.adapter_binding?.adapters ?? []])) : null;
    if (canonical(actor.uniform_adapters) !== canonical(binding?.adapters ?? []) || canonical(actor.invocation_adapters) !== canonical(actual))
      throw new RangeError("native functional actor differs from actual evaluated coefficient actors");
  }
  return actor;
}
function nativeQueryReadoutDependencies(value) {
  const object = (item) => !!item && typeof item === "object" && !Array.isArray(item);
  if (!object(value) || value.kind !== "native-query") return [];
  const fail = () => {
    throw new RangeError("native query readout needs its exact tensor artifact inventory");
  };
  if (!Array.isArray(value.terms)) return fail();
  const deps = /* @__PURE__ */ new Set();
  for (const term of value.terms) {
    if (!object(term) || term.readouts !== void 0 && !Array.isArray(term.readouts) || term.teacher_readouts !== void 0 && !Array.isArray(term.teacher_readouts)) return fail();
    for (const id of [term.readout, term.teacher_readout, ...term.readouts ?? [], ...term.teacher_readouts ?? []]) {
      if (id === void 0 || id === null) continue;
      if (typeof id !== "string" || !TENSOR.test(id)) return fail();
      deps.add(id);
    }
  }
  return [...deps].sort();
}

// src/native/native-derivative-origin.ts
async function verifyNativeDerivativeGradientOrigin(store, artifact) {
  if (!validateNativeDerivativeTarget(artifact.metadata, artifact.tensors)) return;
  const provenance = artifact.metadata.provenance, target = provenance.native_derivative_target;
  const actor = validateNativeFunctionalActor(artifact.metadata, nativeCanonicalJson);
  if (!actor) throw new RangeError("native derivative gradient lacks its complete actual functional actor");
  const program = await store.getNativeTensorArtifact?.(provenance.derivative_program_id);
  if (!program || program.metadata.kind !== "derivative-program" || program.metadata.provenance.schema !== "natlang.native-derivative-program/1" || nativeCanonicalJson(program.metadata.native_identity) !== nativeCanonicalJson(artifact.metadata.native_identity))
    throw new RangeError("native derivative gradient lacks its exact executable program/base");
  const parsed = JSON.parse(program.metadata.provenance.program_json);
  let objective = parsed.outer;
  const inputs = provenance.evaluation_inputs;
  if (!parsed.inputs || !Array.isArray(parsed.nodes) || !inputs || nativeCanonicalJson(Object.keys(inputs).sort()) !== nativeCanonicalJson(Object.keys(parsed.inputs).sort()))
    throw new RangeError("native derivative evaluation lost its complete root binding inventory");
  for (const [name, value] of Object.entries(inputs)) {
    if (!value || Object.keys(value).sort().join(",") !== "kind,names,value_id" || value.kind !== parsed.inputs[name]?.kind || !(value.kind === "native-state" ? /^nzs1_[a-z2-7]{52}$/ : /^nnt1_[a-z2-7]{52}$/).test(value.value_id) || !Array.isArray(value.names) || value.names.some((key) => typeof key !== "string") || nativeCanonicalJson(value.names) !== nativeCanonicalJson([...new Set(value.names)].sort()))
      throw new RangeError("native derivative evaluation has invalid exact root values");
    const state = value.kind === "native-state" ? await store.getNativeState?.(value.value_id) : void 0;
    const tensor = value.kind !== "native-state" ? await store.getNativeTensorArtifact?.(value.value_id) : void 0;
    const available = state ? Object.keys(state.tensors).filter((name2) => /^layers\.[0-9]+\.(?:raw_k|v|gated_inputs|mixed_qkv|z|b|a)$/.test(name2)) : tensor && tensor.metadata.kind === (value.kind === "adapter" ? "adapter-coefficients" : "parameter-set") && nativeCanonicalJson(tensor.metadata.native_identity) === nativeCanonicalJson(artifact.metadata.native_identity) ? Object.keys(tensor.tensors) : [];
    if (!value.names.length || value.names.some((name2) => !available.includes(name2))) throw new RangeError("native derivative evaluation lacks exact bound root names/artifacts");
  }
  if (target.stage === "inner") {
    const node = parsed.nodes.find((node2) => node2.name === provenance.gradient_node);
    const nodeTargets = node?.targets ?? (node?.value ? [{ name: node.name, value: node.value }] : []);
    const selected = nodeTargets.find((item) => item.name === provenance.node);
    if (!node || node.kind !== "gradient" || !selected || selected.value !== target.variable)
      throw new RangeError("native derivative gradient changed its declared inner objective");
    objective = node;
    const owners = Object.keys(parsed.inputs).filter((key) => (node.bindings[key] ?? key) === target.variable);
    if (!owners.length || owners.some((key) => inputs[key]?.value_id !== target.value_id || nativeCanonicalJson(inputs[key]?.names) !== nativeCanonicalJson(target.names)))
      throw new RangeError("native inner gradient belongs to another evaluated value");
  } else {
    const execution = await store.getNativeTensorArtifact?.(provenance.derivative_execution_id);
    if (parsed.inputs[target.variable]?.id !== target.value_id || !execution || execution.metadata.kind !== "derivative-program" || nativeCanonicalJson(execution.metadata.native_identity) !== nativeCanonicalJson(artifact.metadata.native_identity) || execution.metadata.provenance.schema !== "natlang.native-derivative-execution/1" || execution.metadata.provenance.program_id !== program.id || execution.metadata.provenance.outer_graph_sha256 !== provenance.graph_sha256 || nativeCanonicalJson(execution.metadata.provenance.outer_evaluation_inputs) !== nativeCanonicalJson(inputs) || nativeCanonicalJson(execution.metadata.provenance.outer_functional_actor) !== nativeCanonicalJson(actor))
      throw new RangeError("native outer gradient differs from its original input and actual execution");
  }
  for (const [name, value] of Object.entries(inputs)) {
    const variable = objective.bindings[name] ?? name;
    if (parsed.inputs[variable]) {
      if (value.value_id !== parsed.inputs[variable].id) throw new RangeError("native derivative objective changed an unchanged declared root");
    } else {
      const update = parsed.nodes.find((node) => node.name === variable);
      if (!update || update.kind !== "optimizer") throw new RangeError("native derivative objective lacks its declared update");
      if (value.kind === "native-state") {
        const state = await store.getNativeState?.(value.value_id), derivation = state?.metadata.derivation;
        const gradient = derivation?.kind === "optimizer" ? await store.getNativeTensorArtifact?.(derivation.gradient_id) : void 0;
        if (!derivation || derivation.kind !== "optimizer" || derivation.program_id !== program.id || gradient?.metadata.provenance.node !== update.gradient || nativeCanonicalJson(nativeOptimizerOptions(derivation.optimizer)) !== nativeCanonicalJson({ learning_rate: 1e-3, weight_decay: 0, beta1: 0.9, beta2: 0.999, eps: 1e-8, momentum: 0, ...update.optimizer }))
          throw new RangeError("native derivative objective changed its declared state update");
      } else {
        const current = await store.getNativeTensorArtifact?.(value.value_id);
        if (current?.metadata.provenance.derivative_program_id !== program.id || current.metadata.provenance.node !== variable)
          throw new RangeError("native derivative objective changed its declared parameter update");
      }
    }
  }
  if (objective.request.schema === "natlang.native-recorded-objective-request/1") {
    const recordedText = provenance.recorded_objective_request_json;
    if (typeof recordedText !== "string" || hexDigest(recordedText) !== provenance.recorded_objective_request_sha256 || nativeCanonicalJson(JSON.parse(recordedText)) !== nativeCanonicalJson(objective.request))
      throw new RangeError("native derivative gradient changed its exact recorded objective envelope");
    const graphText = provenance.graph_json, queryText = provenance.query_objective_json;
    if (typeof graphText !== "string" || hexDigest(graphText) !== provenance.graph_sha256 || typeof queryText !== "string" || hexDigest(queryText) !== provenance.query_objective_sha256)
      throw new RangeError("native derivative recorded objective lacks its exact lowered graph and query");
    const loweredGraph = JSON.parse(graphText), query = JSON.parse(queryText);
    if (loweredGraph.recorded_objective_sha256 !== hexDigest(nativeCanonicalJson({
      turns: objective.request.turns,
      events: objective.request.events,
      terms: objective.request.terms
    })) || query.kind !== "native-query" || query.schema !== "natlang.native-query-objective/1" || query.graph_sha256 !== provenance.graph_sha256)
      throw new RangeError("native derivative lowered graph differs from its exact recorded source");
    nativeQueryReadoutDependencies(query);
  } else {
    const expectedGraph = structuredClone(objective.request.graph);
    const replacements = new Map(Object.entries(parsed.inputs).filter(([, root]) => root.kind === "native-state").map(([name, root]) => [root.id, inputs[name].value_id]));
    for (const state of Object.values(expectedGraph.external_states ?? {})) state.id = replacements.get(state.id) ?? state.id;
    const graphText = provenance.graph_json;
    if (typeof graphText !== "string" || hexDigest(graphText) !== provenance.graph_sha256 || nativeCanonicalJson(JSON.parse(graphText)) !== nativeCanonicalJson(expectedGraph))
      throw new RangeError("native derivative gradient changed its declared objective graph");
  }
  const expectedObjective = structuredClone(objective.request.objective);
  if (expectedObjective?.kind === "native-query") {
    expectedObjective.graph_sha256 = provenance.graph_sha256;
    const text = provenance.query_objective_json;
    if (typeof text !== "string" || hexDigest(text) !== provenance.query_objective_sha256 || nativeCanonicalJson(JSON.parse(text)) !== nativeCanonicalJson(expectedObjective))
      throw new RangeError("native derivative gradient changed its declared query objective");
  } else if (objective.request.schema !== "natlang.native-recorded-objective-request/1" && provenance.query_objective_json !== void 0)
    throw new RangeError("native derivative gradient introduced an undeclared query objective");
  for (const entries of [actor.uniform_adapters, ...Object.values(actor.invocation_adapters ?? {})]) for (const entry of entries) {
    const value = await store.getNativeTensorArtifact?.(entry.id);
    if (!value || value.metadata.kind !== "adapter-coefficients" || nativeCanonicalJson(value.metadata.native_identity) !== nativeCanonicalJson(artifact.metadata.native_identity))
      throw new RangeError("native functional actor lacks exact evaluated coefficients");
  }
  for (const entry of actor.parameter_values) {
    const value = await store.getNativeTensorArtifact?.(entry.id);
    if (!value || value.metadata.kind !== "parameter-set" || nativeCanonicalJson(value.metadata.native_identity) !== nativeCanonicalJson(artifact.metadata.native_identity) || nativeCanonicalJson(Object.keys(value.tensors).sort()) !== nativeCanonicalJson(entry.names)) throw new RangeError("native functional actor lacks an exact parameter set");
  }
}

// src/native/native-state-derivation.ts
var equalTensor = (a, b) => !!a && !!b && a.dtype === b.dtype && JSON.stringify(a.shape) === JSON.stringify(b.shape) && a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
async function verifyNativeStateDerivation(store, artifact, seen = /* @__PURE__ */ new Set()) {
  const value = artifact.metadata.derivation;
  validateNativeStateDerivation(value);
  if (!value) return;
  if (seen.has(value.parent_state_id)) throw new RangeError("native derivation ancestry is cyclic");
  const nested = new Set(seen);
  nested.add(value.parent_state_id);
  const parent = await store.getNativeState?.(value.parent_state_id);
  if (!parent) throw new RangeError("optimized native state needs its exact archived parent");
  await verifyNativeStateDerivation(store, parent, nested);
  const gradient = await store.getNativeTensorArtifact?.(value.gradient_id), update = await store.getNativeTensorArtifact?.(value.update_artifact_id);
  const prior = value.optimizer_state_parent_id === null ? void 0 : await store.getNativeTensorArtifact?.(value.optimizer_state_parent_id);
  const program = value.program_id === null ? void 0 : await store.getNativeTensorArtifact?.(value.program_id);
  verifyNativeStateDerivationRecords(artifact, parent, gradient, update, prior, program);
}
function verifyNativeStateDerivationRecords(artifact, parent, gradient, update, prior, program) {
  const value = artifact.metadata.derivation;
  validateNativeStateDerivation(value);
  if (!value) return;
  if (parent.id !== value.parent_state_id) throw new RangeError("optimized native state parent binding changed");
  const origin = parent.metadata.derivation?.origin_state_ids ?? [parent.id];
  if (nativeCanonicalJson(origin) !== nativeCanonicalJson(value.origin_state_ids)) throw new RangeError("optimized native state changed its original producer provenance");
  const { derivation: _, ...before } = parent.metadata, { derivation: __, ...after } = artifact.metadata;
  if (nativeCanonicalJson(before) !== nativeCanonicalJson(after)) throw new RangeError("optimized native state changed text, native basis or adapter provenance");
  const expectedBase = parent.metadata.adapter_binding?.base_native_identity ?? {
    checkpoint_sha256: parent.metadata.checkpoint_sha256,
    architecture: parent.metadata.architecture,
    tokenizer_fingerprint: parent.metadata.tokenizer_fingerprint,
    embedding_weight_sha256: parent.metadata.embedding_weight_sha256
  };
  if (!gradient || !update || gradient.metadata.kind !== "state-gradient" || gradient.metadata.source_artifact_id !== parent.id || update.metadata.kind !== "parameter-update" || update.metadata.source_artifact_id !== gradient.id || nativeCanonicalJson(gradient.metadata.native_identity) !== nativeCanonicalJson(expectedBase) || nativeCanonicalJson(update.metadata.native_identity) !== nativeCanonicalJson(gradient.metadata.native_identity) || nativeCanonicalJson(Object.keys(gradient.tensors).sort()) !== nativeCanonicalJson(value.updated_tensor_names) || nativeCanonicalJson(Object.keys(update.tensors).sort()) !== nativeCanonicalJson(value.updated_tensor_names) || (gradient.metadata.provenance.derivative_program_id ?? null) !== value.program_id || nativeCanonicalJson(update.metadata.provenance) !== nativeCanonicalJson({
    schema: value.schema,
    parent_state_id: parent.id,
    optimizer: value.optimizer,
    step: value.step,
    optimizer_state_parent_id: value.optimizer_state_parent_id,
    derivative_program_id: value.program_id,
    arithmetic: value.arithmetic
  }))
    throw new RangeError("optimized native state update, gradient, optimizer or program binding differs");
  if (nativeCanonicalJson(Object.keys(parent.tensors).sort()) !== nativeCanonicalJson(Object.keys(artifact.tensors).sort()) || Object.entries(parent.tensors).some(([name, tensor]) => !equalTensor(artifact.tensors[name], value.updated_tensor_names.includes(name) ? update.tensors[name] : tensor)))
    throw new RangeError("optimized native state changed an unselected tensor or differs from its numeric update");
  if (value.optimizer_state_parent_id === null) {
    if (value.step !== 1) throw new RangeError("new native state history must begin at step one");
  } else {
    if (!prior || prior.metadata.kind !== "optimizer-state" || prior.metadata.source_artifact_id !== parent.id || nativeCanonicalJson(prior.metadata.native_identity) !== nativeCanonicalJson(gradient.metadata.native_identity) || prior.metadata.provenance.scope !== value.schema || prior.metadata.provenance.optimizer !== value.optimizer.name || prior.metadata.provenance.step !== value.step - 1)
      throw new RangeError("optimized native state lacks its exact previous optimizer history");
  }
  if (value.program_id !== null && program?.metadata.kind !== "derivative-program")
    throw new RangeError("optimized native state lacks its executable derivative program");
}

// src/native/neuralese-store.ts
import { sha256 as sha2562 } from "@noble/hashes/sha2.js";
function nativeModelIdentityEqual(left, right) {
  const keys2 = ["checkpoint_sha256", "tokenizer_fingerprint", "embedding_weight_sha256", "architecture"];
  return Object.keys(left).length === keys2.length && Object.keys(right).length === keys2.length && keys2.every((key) => left[key] === right[key]);
}
function nativeStateBlockMeta(artifact) {
  const embeddings = artifact.tensors.embeddings;
  const dialect = `native-state/${artifact.metadata.architecture}`;
  return {
    id: artifact.id,
    dialect,
    length: artifact.tensors.token_ids.shape[0],
    width: embeddings.shape[1],
    native_state: { ...structuredClone(artifact.metadata), embedding_dtype: embeddings.dtype },
    producer: {
      checkpoint_sha256: artifact.metadata.checkpoint_sha256,
      tokenizer_fingerprint: artifact.metadata.tokenizer_fingerprint,
      embedding_weight_sha256: artifact.metadata.embedding_weight_sha256
    }
  };
}
function nativeTensorArtifactBlockMeta(artifact) {
  return {
    id: artifact.id,
    dialect: `native-tensor/${artifact.metadata.kind}`,
    length: artifact.metadata.tensors.length,
    width: 1,
    native_tensor_artifact: structuredClone(artifact.metadata),
    producer: { ...artifact.metadata.native_identity, objective: artifact.metadata.provenance.objective }
  };
}
function nativeTensorArtifactDependencies(artifact) {
  const meta = artifact.metadata;
  const dependencies = (meta.kind === "adapter-coefficients" || meta.kind === "adapter-gradient" || meta.kind === "optimizer-state" && meta.provenance.scope === "natlang.native-adapter/1") && meta.source_artifact_id ? [meta.source_artifact_id] : [];
  if (meta.provenance.query_objective_json !== void 0 || meta.provenance.query_objective_sha256 !== void 0) {
    const text = meta.provenance.query_objective_json;
    if (typeof text !== "string" || hexDigest(text) !== meta.provenance.query_objective_sha256)
      throw new RangeError("native query gradient changed its exact objective declaration");
    const query = JSON.parse(text);
    if (query?.schema !== "natlang.native-query-objective/1" || query.kind !== "native-query")
      throw new RangeError("native query gradient has an unsupported objective declaration");
    dependencies.push(...nativeQueryReadoutDependencies(query));
  }
  if (meta.kind === "derivative-program") {
    validateNativeDerivativeArtifact(meta.provenance);
    dependencies.push(...meta.provenance.dependencies);
  }
  for (const key of ["derivative_program_id", "derivative_execution_id"]) if (meta.provenance[key] !== void 0 && meta.provenance[key] !== null) {
    const id = meta.provenance[key];
    if (typeof id !== "string" || !/^nnt1_[a-z2-7]{52}$/.test(id)) throw new RangeError("native derivative artifact dependency needs its exact ID");
    dependencies.push(id);
  }
  if (meta.kind === "state-gradient" && meta.source_artifact_id) dependencies.push(meta.source_artifact_id);
  if (meta.provenance.scope === "natlang.native-state-derivation/1" || meta.provenance.schema === "natlang.native-state-derivation/1" || meta.provenance.scope === "natlang.native-derivative-program/1") {
    for (const key of ["gradient_id", "parent_state_id", "optimizer_state_parent_id", "parent_value_id", "parameter_value_id"]) {
      const id = meta.provenance[key];
      if (typeof id === "string") dependencies.push(id);
    }
    if (meta.source_artifact_id) dependencies.push(meta.source_artifact_id);
  }
  if (meta.provenance.derivative_program_id) {
    for (const key of ["parent_value_id", "parameter_value_id", "gradient_id", "optimizer_state_parent_id"]) {
      const id = meta.provenance[key];
      if (typeof id === "string") dependencies.push(id);
    }
    if (meta.source_artifact_id) dependencies.push(meta.source_artifact_id);
  }
  const functional = meta.provenance.functional_actor;
  if (functional) {
    dependencies.push(...functional.parameter_values.map((entry) => entry.id), ...functional.uniform_adapters.map((entry) => entry.id));
    for (const entries of Object.values(functional.invocation_adapters ?? {})) dependencies.push(...entries.map((entry) => entry.id));
  }
  for (const value of Object.values(meta.provenance.evaluation_inputs ?? {})) dependencies.push(value.value_id);
  const binding = meta.kind === "adapter-gradient" ? meta.provenance.adapter_binding : void 0;
  if (binding) {
    validateNativeAdapterBinding(binding, meta.provenance.effective_native_identity);
    dependencies.push(...binding.adapters.map((entry) => entry.id));
  }
  const actors = meta.provenance.invocation_actors;
  if (actors) {
    validateNativeInvocationActorReceipt(actors, meta.native_identity);
    validateNativeInvocationSourceNames(meta, actors);
    if (meta.provenance.actor_graph_sha256 !== hexDigest(nativeCanonicalJson(actors))) throw new RangeError("native invocation actor graph digest differs from its receipt");
    for (const actor of Object.values(actors.invocations))
      dependencies.push(...(actor.adapter_binding?.adapters ?? []).map((entry) => entry.id));
  }
  const behavior = validateNativeInvocationBehaviorProvenance(meta);
  if (behavior) for (const receipt of Object.values(behavior.episodes)) for (const actor of Object.values(receipt.invocations))
    dependencies.push(...(actor.adapter_binding?.adapters ?? []).map((entry) => entry.id));
  const contracts = meta.provenance.external_adapter_state_contracts;
  for (const contract of Object.values(contracts ?? {})) for (const side of ["source", "target"]) {
    const actor = contract[`${side}_adapter_binding`];
    if (actor) {
      validateNativeAdapterBinding(actor, contract[`${side}_native_identity`]);
      dependencies.push(...actor.adapters.map((entry) => entry.id));
    }
  }
  return [...new Set(dependencies)];
}
function nativeStateArtifactDependencies(artifact) {
  return [.../* @__PURE__ */ new Set([
    ...artifact.metadata.adapter_binding?.adapters.map((entry) => entry.id) ?? [],
    ...nativeStateDerivationDependencies(artifact.metadata.derivation)
  ])];
}
async function archiveNativeArtifactFrom(remote, archive, id, active = /* @__PURE__ */ new Set()) {
  if (active.has(id)) throw new Error("neuralese-native-artifact-cycle: exact native dependencies must form a DAG");
  const nested = new Set(active);
  nested.add(id);
  if (id.startsWith("nzs1_")) {
    if (!archive.getNativeState || !archive.putNativeState) throw new Error("neuralese-native-archive-unavailable: configure a native state archive");
    const found2 = await archive.getNativeState(id);
    const wire = found2 || !remote.getNativeStateWire || !archive.putNativeStateWire ? void 0 : await remote.getNativeStateWire(id);
    const artifact2 = found2 ?? (wire ? decodeNativeState(wire, id) : await remote.getNativeState?.(id));
    if (!artifact2) throw new Error(`neuralese-unknown-native-state: restore native state ${id}`);
    for (const dependency of nativeStateArtifactDependencies(artifact2)) await archiveNativeArtifactFrom(remote, archive, dependency, nested);
    if (found2) return found2;
    if (wire) {
      const saved3 = await archive.putNativeStateWire(wire, id);
      if (saved3.id !== id) throw new Error("neuralese-block-integrity: native state changed during archival");
      return saved3;
    }
    const { id: _2, ...input2 } = artifact2, saved2 = await archive.putNativeState(input2);
    if (saved2.id !== id) throw new Error("neuralese-block-integrity: native state changed during archival");
    return saved2;
  }
  if (!id.startsWith("nnt1_") || !archive.getNativeTensorArtifact || !archive.putNativeTensorArtifact)
    throw new Error("neuralese-native-archive-unavailable: configure a named tensor archive");
  const found = await archive.getNativeTensorArtifact(id), artifact = found ?? await remote.getNativeTensorArtifact?.(id);
  if (!artifact) throw new Error(`neuralese-unknown-native-artifact: restore native tensor ${id}`);
  for (const dependency of nativeTensorArtifactDependencies(artifact)) await archiveNativeArtifactFrom(remote, archive, dependency, nested);
  if (found) return found;
  const { id: _, ...input } = artifact, saved = await archive.putNativeTensorArtifact(input);
  if (saved.id !== id) throw new Error("neuralese-block-integrity: native artifact changed during archival");
  return saved;
}
async function archiveNativeTensorFrom(remote, archive, id) {
  if (!id.startsWith("nnt1_")) throw new RangeError("native tensor archive requires a named tensor ID");
  return await archiveNativeArtifactFrom(remote, archive, id);
}
async function importNativeArtifactBundle(store, states, tensors) {
  const done = /* @__PURE__ */ new Set(), active = /* @__PURE__ */ new Set();
  const restore = async (id) => {
    if (done.has(id)) return;
    if (active.has(id)) throw new RangeError("native artifact dependencies must form a finite DAG");
    active.add(id);
    const state = states.get(id), tensor = tensors.get(id);
    if (!state && !tensor) {
      if (await store.has(id)) {
        active.delete(id);
        done.add(id);
        return;
      }
      throw new RangeError(`native bundle lacks dependency ${id}`);
    }
    for (const dependency of state ? nativeStateArtifactDependencies(state) : nativeTensorArtifactDependencies(tensor)) await restore(dependency);
    if (!await store.has(id)) {
      if (state) {
        if (!store.putNativeState) throw new RangeError("native bundle needs a state-capable archive");
        const { id: _, ...input } = state;
        if ((await store.putNativeState(input)).id !== id) throw new RangeError("native bundle state identity changed");
      } else {
        if (!store.putNativeTensorArtifact) throw new RangeError("native bundle needs a named tensor archive");
        const { id: _, ...input } = tensor;
        if ((await store.putNativeTensorArtifact(input)).id !== id) throw new RangeError("native bundle tensor identity changed");
      }
    }
    active.delete(id);
    done.add(id);
  };
  for (const id of [...states.keys(), ...tensors.keys()]) await restore(id);
}
async function nativeArtifactDependencyClosure(store, roots) {
  const keep = new Set(roots), pending = [...keep];
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index];
    const artifact = id.startsWith("nnt1_") ? await store.getNativeTensorArtifact?.(id) : void 0;
    const state = id.startsWith("nzs1_") ? await store.getNativeState?.(id) : void 0;
    const dependencies = artifact ? nativeTensorArtifactDependencies(artifact) : state ? nativeStateArtifactDependencies(state) : [];
    for (const dependency of dependencies) if (!keep.has(dependency)) {
      keep.add(dependency);
      pending.push(dependency);
    }
  }
  return keep;
}
var BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32(bytes) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[value << 5 - bits & 31];
  return out;
}
var NATIVE_DTYPE_BYTES = { F16: 2, BF16: 2, F32: 4, F64: 8, I64: 8 };
var NATIVE_FLOAT_DTYPE_BYTES = { F16: 2, BF16: 2, F32: 4, F64: 8 };
var SHA256 = /^[0-9a-f]{64}$/;
function validNativeAdapterScaleHex(value) {
  if (typeof value !== "string") return false;
  if (/^-?0x0\.0p\+0$/.test(value)) return true;
  const match = /^-?0x([01])\.([0-9a-f]{13})p([+-]\d+)$/.exec(value);
  if (!match) return false;
  const exponent = Number(match[3]);
  if (match[3] !== `${exponent >= 0 ? "+" : ""}${exponent}` || exponent < -1022 || exponent > 1023) return false;
  return match[1] === "1" || exponent === -1022 && Number.parseInt(match[2], 16) !== 0;
}
function validateNativeAdapterBinding(binding, metadata) {
  const base = binding?.base_native_identity;
  if (!metadata || !binding || binding.schema !== "natlang.native-adapter/1" || !base || Object.keys(base).sort().join(",") !== "architecture,checkpoint_sha256,embedding_weight_sha256,tokenizer_fingerprint" || !SHA256.test(base.checkpoint_sha256) || !nativeModelIdentityEqual(base, {
    checkpoint_sha256: base.checkpoint_sha256,
    tokenizer_fingerprint: metadata.tokenizer_fingerprint,
    embedding_weight_sha256: metadata.embedding_weight_sha256,
    architecture: metadata.architecture
  }) || !Array.isArray(binding.adapters) || !binding.adapters.length || binding.adapters.some((entry) => !entry || Object.keys(entry).sort().join(",") !== "id,scale_hex" || !/^nnt1_[a-z2-7]{52}$/.test(entry.id) || !validNativeAdapterScaleHex(entry.scale_hex)) || Object.keys(binding).sort().join(",") !== "adapters,base_native_identity,schema")
    throw new RangeError("invalid native adapter state binding");
  const hash = [...digest(new TextEncoder().encode(nativeCanonicalJson(binding)))].map((value) => value.toString(16).padStart(2, "0")).join("");
  if (hash !== metadata.checkpoint_sha256) throw new RangeError("native state differs from its exact adapted model identity");
}
function validateNativeAdapterStateConsumption(receipt, source, target) {
  const identity = (value) => ({
    checkpoint_sha256: value.checkpoint_sha256,
    tokenizer_fingerprint: value.tokenizer_fingerprint,
    embedding_weight_sha256: value.embedding_weight_sha256,
    architecture: value.architecture
  });
  const equal = (a, b) => nativeCanonicalJson(a) === nativeCanonicalJson(b);
  const sourceIdentity = identity(source.metadata), targetIdentity = identity(target);
  const sourceBinding = source.metadata.adapter_binding ?? null, targetBinding = target.adapter_binding ?? null;
  if (!receipt || Object.keys(receipt).sort().join(",") !== "base_native_identity,mode,schema,source_adapter_binding,source_native_identity,source_state_id,target_adapter_binding,target_native_identity,target_position_start,tokens" || receipt.schema !== "natlang.native-adapter-state-consumption/1" || receipt.mode !== "same-base-adapter-state" || source.metadata.schema !== "neuralese.native-state/1" || receipt.source_state_id !== source.id || !equal(receipt.source_native_identity, sourceIdentity) || !equal(receipt.target_native_identity, targetIdentity) || !equal(receipt.source_adapter_binding, sourceBinding) || !equal(receipt.target_adapter_binding, targetBinding) || !Number.isSafeInteger(receipt.target_position_start) || receipt.target_position_start < 0 || receipt.tokens !== source.tensors.token_ids?.shape[0]) throw new RangeError("invalid exact-base adapter-state consumption receipt");
  if (sourceBinding) validateNativeAdapterBinding(sourceBinding, sourceIdentity);
  if (targetBinding) validateNativeAdapterBinding(targetBinding, targetIdentity);
  const sourceBase = sourceBinding?.base_native_identity ?? sourceIdentity;
  const targetBase = targetBinding?.base_native_identity ?? targetIdentity;
  if (!equal(sourceBase, targetBase) || !equal(receipt.base_native_identity, sourceBase))
    throw new RangeError("adapter-state consumption requires the exact same immutable base");
}
function validateNativeInvocationActorReceipt(receipt, base) {
  if (!receipt || Object.keys(receipt).sort().join(",") !== "base_native_identity,invocations,schema" || receipt.schema !== "natlang.native-invocation-actors/1" || !nativeModelIdentityEqual(receipt.base_native_identity, base) || !receipt.invocations || Array.isArray(receipt.invocations) || !Object.keys(receipt.invocations).length)
    throw new RangeError("native invocation actor receipt needs its exact base and complete inventory");
  for (const [name, actor] of Object.entries(receipt.invocations)) {
    if (!name || !actor || Object.keys(actor).sort().join(",") !== "adapter_binding,native_identity" || !actor.native_identity || Object.keys(actor.native_identity).sort().join(",") !== "architecture,checkpoint_sha256,embedding_weight_sha256,tokenizer_fingerprint")
      throw new RangeError("native invocation actor identity is malformed");
    if (actor.adapter_binding === null) {
      if (!nativeModelIdentityEqual(actor.native_identity, base)) throw new RangeError("unadapted invocation differs from its base");
    } else {
      validateNativeAdapterBinding(actor.adapter_binding, actor.native_identity);
      if (!nativeModelIdentityEqual(actor.adapter_binding.base_native_identity, base))
        throw new RangeError("native invocation actor changed its immutable base");
    }
  }
}
function validateNativeInvocationBehaviorPolicy(policy, base) {
  if (!policy || Object.keys(policy).sort().join(",") !== "base_native_identity,collector_policy_role,episodes,schema" || policy.schema !== "natlang.native-invocation-policy/1" || policy.collector_policy_role !== "base-runtime-metadata" || !nativeModelIdentityEqual(policy.base_native_identity, base) || !policy.episodes || typeof policy.episodes !== "object" || Array.isArray(policy.episodes) || !Object.keys(policy.episodes).length)
    throw new RangeError("native invocation behavior policy needs its exact base and immutable episode inventory");
  for (const [episode, actors] of Object.entries(policy.episodes)) {
    if (!SHA256.test(episode)) throw new RangeError("native invocation behavior episode must bind exact original row bytes");
    validateNativeInvocationActorReceipt(actors, base);
  }
}
function validateNativeInvocationBehaviorProvenance(metadata) {
  const policy = metadata.provenance.behavior_policy;
  if (policy === void 0) {
    if (metadata.provenance.behavior_policy_sha256 !== void 0)
      throw new RangeError("native invocation behavior digest lacks its actual descriptor");
    return void 0;
  }
  validateNativeInvocationBehaviorPolicy(policy, metadata.native_identity);
  if (metadata.provenance.behavior_policy_sha256 !== hexDigest(nativeCanonicalJson(policy)))
    throw new RangeError("native invocation behavior descriptor digest changed");
  return policy;
}
function validateNativeInvocationSourceNames(metadata, actors) {
  const names = metadata.provenance.invocation_source_names;
  if (names !== void 0 && (!names || typeof names !== "object" || Array.isArray(names) || Object.keys(names).some((key) => !key) || Object.keys(names).length !== Object.keys(actors.invocations).length || nativeCanonicalJson(Object.values(names).sort()) !== nativeCanonicalJson(Object.keys(actors.invocations).sort())))
    throw new RangeError("native invocation source names changed exact packed ownership");
}
function validateNativeState(metadata, tensors) {
  if (!metadata || metadata.schema !== "neuralese.native-state/1" || typeof metadata.text !== "string" || typeof metadata.architecture !== "string" || !metadata.architecture || !SHA256.test(metadata.tokenizer_fingerprint) || !SHA256.test(metadata.checkpoint_sha256) || !SHA256.test(metadata.embedding_weight_sha256) || !Array.isArray(metadata.layer_kinds) || !metadata.layer_kinds.length)
    throw new RangeError("invalid native-state metadata");
  if (metadata.adapter_binding !== void 0) validateNativeAdapterBinding(metadata.adapter_binding, metadata);
  validateNativeStateDerivation(metadata.derivation);
  const expected = /* @__PURE__ */ new Set(["token_ids", "positions", "embeddings"]);
  const count = (name, rank) => {
    const tensor = tensors[name];
    if (!tensor || tensor.shape.length !== rank || tensor.shape.some((size, index) => !Number.isSafeInteger(size) || (index === 0 ? size < 0 : size <= 0)) || !Number.isSafeInteger(tensor.shape.reduce((n, size) => n * size, 1)) || tensor.data.length !== tensor.shape.reduce((n, size) => n * size, 1) * NATIVE_DTYPE_BYTES[tensor.dtype])
      throw new RangeError(`invalid native-state tensor ${name}`);
    return tensor.shape;
  };
  const ids = tensors.token_ids, positions = tensors.positions;
  const tokenShape = count("token_ids", 1), positionShape = count("positions", 1), embeddingShape = count("embeddings", 2);
  if (ids.dtype !== "I64" || positions.dtype !== "I64" || tokenShape[0] !== positionShape[0] || embeddingShape[0] !== tokenShape[0])
    throw new RangeError("native-state token axes or integer tensor types differ");
  const i64 = (tensor) => new DataView(tensor.data.buffer, tensor.data.byteOffset, tensor.data.byteLength);
  const iv = i64(ids), pv = i64(positions);
  for (let i = 0; i < tokenShape[0]; i++) {
    const token = iv.getBigInt64(i * 8, true), position = pv.getBigInt64(i * 8, true);
    if (token < 0n || position < 0n || i && position !== pv.getBigInt64((i - 1) * 8, true) + 1n)
      throw new RangeError("native-state token IDs or positions are invalid");
  }
  const finite = (name, tensor) => {
    if (tensor.dtype === "I64") throw new RangeError(`native-state ${name} must be floating point`);
    const view = new DataView(tensor.data.buffer, tensor.data.byteOffset, tensor.data.byteLength);
    for (let at = 0; at < tensor.data.length; at += NATIVE_DTYPE_BYTES[tensor.dtype]) {
      let value;
      if (tensor.dtype === "F16") {
        const h = view.getUint16(at, true), sign = h & 32768 ? -1 : 1, exponent = h >> 10 & 31, mantissa = h & 1023;
        value = exponent === 31 ? Number.NaN : sign * (exponent === 0 ? mantissa * 2 ** -24 : (1 + mantissa / 1024) * 2 ** (exponent - 15));
      } else if (tensor.dtype === "BF16") {
        const bits = view.getUint16(at, true) << 16;
        const word = new ArrayBuffer(4), wordView = new DataView(word);
        wordView.setUint32(0, bits, true);
        value = wordView.getFloat32(0, true);
      } else value = tensor.dtype === "F32" ? view.getFloat32(at, true) : view.getFloat64(at, true);
      if (!Number.isFinite(value)) throw new RangeError(`native-state ${name} contains non-finite values`);
    }
  };
  finite("embeddings", tensors.embeddings);
  for (let index = 0; index < metadata.layer_kinds.length; index++) {
    const kind = metadata.layer_kinds[index], prefix = `layers.${index}.`;
    if (kind === "attention") {
      const k = count(`${prefix}raw_k`, 3), v = count(`${prefix}v`, 3), kt = tensors[`${prefix}raw_k`], vt = tensors[`${prefix}v`];
      if (k[0] !== tokenShape[0] || v.some((size, axis) => size !== k[axis]) || kt.dtype !== vt.dtype)
        throw new RangeError(`invalid native-state attention layer ${index}`);
      expected.add(`${prefix}raw_k`);
      expected.add(`${prefix}v`);
      finite(`${prefix}raw_k`, kt);
      finite(`${prefix}v`, vt);
    } else if (kind === "finite_convolution") {
      const name = `${prefix}gated_inputs`, shape = count(name, 2), tensor = tensors[name];
      if (shape[0] !== tokenShape[0]) throw new RangeError(`invalid native-state convolution layer ${index}`);
      expected.add(name);
      finite(name, tensor);
    } else if (kind === "gated_delta") {
      const names = ["mixed_qkv", "z", "b", "a"];
      const shapes = names.map((name) => {
        const tensorName = `${prefix}${name}`, shape = count(tensorName, 2), tensor = tensors[tensorName];
        if (shape[0] !== tokenShape[0]) throw new RangeError(`invalid native-state gated delta layer ${index}`);
        expected.add(tensorName);
        finite(tensorName, tensor);
        return shape;
      });
      if (shapes[2][1] !== shapes[3][1]) throw new RangeError(`invalid native-state gated delta gates ${index}`);
    } else throw new RangeError(`unsupported native-state layer kind ${String(kind)}`);
  }
  if (Object.keys(tensors).length !== expected.size || Object.keys(tensors).some((name) => !expected.has(name)))
    throw new RangeError("native-state tensor inventory differs from its layer layout");
}
function u32(value) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value, true);
  return b;
}
function u64(value) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(value), true);
  return b;
}
function joinBytes(parts) {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
function nativeCanonicalJson(value) {
  const sort = (item) => Array.isArray(item) ? item.map(sort) : item && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(value));
}
function validateNativeTensorArtifact(metadata, tensors) {
  if (!metadata || metadata.schema !== "natlang.neuralese-native-tensor-artifact/1" || !["parameter-set", "parameter-gradient", "parameter-update", "state-gradient", "optimizer-state", "adapter-basis", "adapter-coefficients", "adapter-gradient", "derivative-program"].includes(metadata.kind) || !metadata.native_identity || !SHA256.test(metadata.native_identity.checkpoint_sha256) || !SHA256.test(metadata.native_identity.tokenizer_fingerprint) || !SHA256.test(metadata.native_identity.embedding_weight_sha256) || typeof metadata.native_identity.architecture !== "string" || !metadata.native_identity.architecture || metadata.source_artifact_id !== null && !/^(?:nzs1_|nnt1_)[a-z2-7]{52}$/.test(metadata.source_artifact_id) || !metadata.provenance || typeof metadata.provenance !== "object" || Array.isArray(metadata.provenance) || !tensors || typeof tensors !== "object" || !Object.keys(tensors).length && metadata.kind !== "derivative-program")
    throw new RangeError("invalid native tensor artifact metadata");
  if (metadata.kind === "derivative-program") {
    validateNativeDerivativeArtifact(metadata.provenance);
    if (Object.keys(tensors).length) throw new RangeError("native derivative program stores metadata, never fake tensor payloads");
  }
  const derivativeTarget = validateNativeDerivativeTarget(metadata, tensors);
  validateNativeFunctionalActor(metadata, nativeCanonicalJson);
  validateNativeInvocationBehaviorProvenance(metadata);
  const actors = metadata.provenance.invocation_actors;
  if (actors) {
    validateNativeInvocationActorReceipt(actors, metadata.native_identity);
    validateNativeInvocationSourceNames(metadata, actors);
    if (metadata.provenance.actor_graph_sha256 !== hexDigest(nativeCanonicalJson(actors))) throw new RangeError("native invocation actor graph digest differs from its receipt");
    if (metadata.kind === "adapter-gradient" && !derivativeTarget && !Object.values(actors.invocations).some((actor) => actor.adapter_binding?.adapters.some((entry) => entry.id === metadata.source_artifact_id)))
      throw new RangeError("native invocation gradient target is not one of its exact actors");
  }
  if (metadata.kind === "adapter-gradient" && metadata.provenance.adapter_binding !== void 0) {
    const binding = metadata.provenance.adapter_binding;
    validateNativeAdapterBinding(binding, metadata.provenance.effective_native_identity);
    if (!nativeModelIdentityEqual(binding.base_native_identity, metadata.native_identity))
      throw new RangeError("native adapter gradient changed its exact base identity");
  }
  const inventory = Object.keys(tensors).sort().map((name) => {
    const tensor = tensors[name];
    if (!name || !tensor || !(tensor.dtype in NATIVE_FLOAT_DTYPE_BYTES) || !Array.isArray(tensor.shape) || !tensor.shape.length || tensor.shape.some((size) => !Number.isSafeInteger(size) || size <= 0) || !Number.isSafeInteger(tensor.shape.reduce((n, size) => n * size, 1)) || tensor.data.length !== tensor.shape.reduce((n, size) => n * size, 1) * NATIVE_FLOAT_DTYPE_BYTES[tensor.dtype])
      throw new RangeError(`invalid native artifact tensor ${name}`);
    const view = new DataView(tensor.data.buffer, tensor.data.byteOffset, tensor.data.byteLength);
    for (let at = 0; at < tensor.data.length; at += NATIVE_FLOAT_DTYPE_BYTES[tensor.dtype]) {
      let value;
      if (tensor.dtype === "F16") {
        const h = view.getUint16(at, true), sign = h & 32768 ? -1 : 1, exponent = h >> 10 & 31, mantissa = h & 1023;
        value = exponent === 31 ? Number.NaN : sign * (exponent === 0 ? mantissa * 2 ** -24 : (1 + mantissa / 1024) * 2 ** (exponent - 15));
      } else if (tensor.dtype === "BF16") {
        const word = new ArrayBuffer(4), wordView = new DataView(word);
        wordView.setUint32(0, view.getUint16(at, true) << 16, true);
        value = wordView.getFloat32(0, true);
      } else value = tensor.dtype === "F32" ? view.getFloat32(at, true) : view.getFloat64(at, true);
      if (!Number.isFinite(value)) throw new RangeError(`native artifact tensor ${name} contains non-finite values`);
    }
    return { name, dtype: tensor.dtype, shape: [...tensor.shape] };
  });
  if (nativeCanonicalJson(metadata.tensors) !== nativeCanonicalJson(inventory))
    throw new RangeError("native tensor metadata differs from the exact named tensor inventory");
}
function nativeTensorArtifactContentId(metadata, tensors, canonicalMetadata) {
  validateNativeTensorArtifact(metadata, tensors);
  const exact = canonicalMetadata ?? nativeCanonicalJson(metadata);
  if (nativeCanonicalJson(JSON.parse(exact)) !== nativeCanonicalJson(metadata))
    throw new RangeError("native artifact preserved metadata bytes differ from its actual fields");
  const metaBytes = new TextEncoder().encode(exact);
  const parts = [
    new TextEncoder().encode("natlang.neuralese-native-tensor-artifact/1\0"),
    u64(metaBytes.length),
    metaBytes
  ];
  for (const name of Object.keys(tensors).sort()) {
    const tensor = tensors[name], nameBytes = new TextEncoder().encode(name);
    const descriptor = new TextEncoder().encode(nativeCanonicalJson({ dtype: tensor.dtype, shape: tensor.shape }));
    parts.push(
      u32(nameBytes.length),
      nameBytes,
      u32(descriptor.length),
      descriptor,
      u64(tensor.data.length),
      tensor.data
    );
  }
  return `nnt1_${base32(digest(joinBytes(parts)))}`;
}
function encodeNativeTensorArtifact(artifact) {
  const id = nativeTensorArtifactContentId(artifact.metadata, artifact.tensors, artifact.canonicalMetadata);
  const entries = {}, payloads = [];
  let offset = 0;
  for (const name of Object.keys(artifact.tensors).sort()) {
    const tensor = artifact.tensors[name];
    entries[name] = { dtype: tensor.dtype, shape: tensor.shape, data_offsets: [offset, offset + tensor.data.length] };
    payloads.push(tensor.data);
    offset += tensor.data.length;
  }
  const exact = artifact.canonicalMetadata ?? nativeCanonicalJson(artifact.metadata);
  entries.__metadata__ = { "natlang.native_tensor_artifact": `{"id":${JSON.stringify(id)},${exact.slice(1)}` };
  const raw = new TextEncoder().encode(nativeCanonicalJson(entries));
  const header = new Uint8Array(Math.ceil(raw.length / 8) * 8).fill(32);
  header.set(raw);
  return joinBytes([u64(header.length), header, ...payloads]);
}
function decodeNativeTensorArtifact(bytes) {
  if (bytes.length < 8) throw new RangeError("not a native tensor artifact safetensors file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), headerSize = Number(view.getBigUint64(0, true));
  if (!Number.isSafeInteger(headerSize) || 8 + headerSize > bytes.length) throw new RangeError("native tensor artifact header exceeds body");
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerSize)));
  const metadataText = header.__metadata__?.["natlang.native_tensor_artifact"];
  if (typeof metadataText !== "string") throw new RangeError("missing canonical native tensor artifact metadata");
  const stored = JSON.parse(metadataText);
  const { id, ...metadata } = stored;
  const payload = bytes.subarray(8 + headerSize), tensors = {}, spans = [];
  for (const [name, raw] of Object.entries(header)) {
    if (name === "__metadata__") continue;
    const entry = raw;
    if (!entry || !entry.dtype || !(entry.dtype in NATIVE_FLOAT_DTYPE_BYTES) || !Array.isArray(entry.shape) || !Array.isArray(entry.data_offsets) || entry.data_offsets.length !== 2)
      throw new RangeError(`invalid native artifact descriptor ${name}`);
    const [start, end] = entry.data_offsets, count = entry.shape.reduce((n, size) => n * size, 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end - start !== count * NATIVE_FLOAT_DTYPE_BYTES[entry.dtype] || end > payload.length)
      throw new RangeError(`invalid native artifact byte range ${name}`);
    spans.push([start, end]);
    tensors[name] = { dtype: entry.dtype, shape: [...entry.shape], data: payload.slice(start, end) };
  }
  spans.sort((a, b) => a[0] - b[0]);
  if (!spans.length ? metadata.kind !== "derivative-program" || payload.length !== 0 : spans[0][0] !== 0 || spans.at(-1)[1] !== payload.length || spans.some((span, index) => index > 0 && spans[index - 1][1] !== span[0]))
    throw new RangeError("native tensor artifact payload has gaps or overlaps");
  const prefix = `{"id":${JSON.stringify(id)},`;
  const canonicalMetadata = metadataText.startsWith(prefix) ? "{" + metadataText.slice(prefix.length) : void 0;
  const actual = nativeTensorArtifactContentId(metadata, tensors, canonicalMetadata);
  if (actual !== id) throw new RangeError(`native tensor artifact ID mismatch: ${actual}`);
  return { id: actual, metadata, tensors, canonicalMetadata };
}
function nativeStateContentId(metadata, tensors) {
  validateNativeState(metadata, tensors);
  const metaBytes = new TextEncoder().encode(nativeCanonicalJson(metadata));
  const hash = sha2562.create();
  for (const part of [new TextEncoder().encode("natlang.native-state/1\0"), u64(metaBytes.length), metaBytes]) hash.update(part);
  for (const name of Object.keys(tensors).sort()) {
    const tensor = tensors[name];
    const elements = tensor.shape.reduce((product, size) => product * size, 1);
    if (!tensor.shape.length || tensor.shape.some((size, index) => !Number.isSafeInteger(size) || (index === 0 ? size < 0 : size <= 0)) || tensor.data.length !== elements * NATIVE_DTYPE_BYTES[tensor.dtype]) throw new RangeError(`invalid native tensor ${name}`);
    const nameBytes = new TextEncoder().encode(name);
    const descriptor = new TextEncoder().encode(nativeCanonicalJson({ dtype: tensor.dtype, shape: tensor.shape }));
    for (const part of [u32(nameBytes.length), nameBytes, u32(descriptor.length), descriptor, u64(tensor.data.length), tensor.data])
      hash.update(part);
  }
  return `nzs1_${base32(hash.digest())}`;
}
function encodeNativeState(artifact) {
  return encodeNativeStateWire(artifact).wire;
}
function encodeNativeStateWire(artifact) {
  const id = nativeStateContentId(artifact.metadata, artifact.tensors);
  const entries = {};
  const payloads = [];
  let offset = 0;
  for (const name of Object.keys(artifact.tensors).sort()) {
    const tensor = artifact.tensors[name];
    entries[name] = { dtype: tensor.dtype, shape: tensor.shape, data_offsets: [offset, offset + tensor.data.length] };
    payloads.push(tensor.data);
    offset += tensor.data.length;
  }
  entries.__metadata__ = { "natlang.native_state": nativeCanonicalJson({ id, ...artifact.metadata }) };
  let header = new TextEncoder().encode(nativeCanonicalJson(entries));
  const aligned = new Uint8Array(Math.ceil(header.length / 8) * 8).fill(32);
  aligned.set(header);
  header = aligned;
  const body = joinBytes([u64(header.length), header, ...payloads]);
  return { id, wire: body };
}
function checkNativeStateFinite(tensors) {
  for (const [name, tensor] of Object.entries(tensors)) {
    const { data } = tensor;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let bad = false;
    if (tensor.dtype === "F32") for (let at = 0; at < data.length && !bad; at += 4) bad = (view.getUint32(at, true) & 2139095040) === 2139095040;
    else if (tensor.dtype === "BF16") for (let at = 0; at < data.length && !bad; at += 2) bad = (view.getUint16(at, true) & 32640) === 32640;
    else if (tensor.dtype === "F16") for (let at = 0; at < data.length && !bad; at += 2) bad = (view.getUint16(at, true) & 31744) === 31744;
    else if (tensor.dtype === "F64") for (let at = 0; at < data.length && !bad; at += 8) bad = (view.getUint32(at + 4, true) & 2146435072) === 2146435072;
    if (bad) throw new RangeError(`native state ${name} contains non-finite values`);
  }
}
function decodeNativeState(bytes, verifiedId) {
  if (bytes.length < 8) throw new RangeError("not a native state safetensors file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = Number(view.getBigUint64(0, true));
  if (!Number.isSafeInteger(headerSize) || 8 + headerSize > bytes.length) throw new RangeError("native state header exceeds the body");
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerSize)));
  const metaField = header.__metadata__?.natlang_native_state;
  const metadataText = header.__metadata__?.["natlang.native_state"];
  if (typeof metadataText !== "string" || metaField !== void 0) throw new RangeError("missing canonical native-state metadata");
  const stored = JSON.parse(metadataText);
  const { id, ...metadata } = stored;
  if (metadata.schema !== "neuralese.native-state/1" || typeof metadata.text !== "string" || typeof metadata.architecture !== "string" || !Array.isArray(metadata.layer_kinds))
    throw new RangeError("unsupported native state metadata");
  const payload = bytes.subarray(8 + headerSize);
  const tensors = {};
  const spans = [];
  for (const [name, raw] of Object.entries(header)) {
    if (name === "__metadata__") continue;
    const entry = raw;
    if (!entry || !entry.dtype || !(entry.dtype in NATIVE_DTYPE_BYTES) || !Array.isArray(entry.shape) || !entry.shape.length || entry.shape.some((size, index) => !Number.isSafeInteger(size) || (index === 0 ? size < 0 : size <= 0)) || !Array.isArray(entry.data_offsets) || entry.data_offsets.length !== 2)
      throw new RangeError(`invalid native tensor descriptor ${name}`);
    const [start, end] = entry.data_offsets;
    const count = entry.shape.reduce((n, size) => n * size, 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end - start !== count * NATIVE_DTYPE_BYTES[entry.dtype] || end > payload.length)
      throw new RangeError(`invalid native tensor byte range ${name}`);
    spans.push([start, end]);
    tensors[name] = { dtype: entry.dtype, shape: [...entry.shape], data: payload.subarray(start, end) };
  }
  spans.sort((a, b) => a[0] - b[0]);
  if (!spans.length || spans[0][0] !== 0 || spans.at(-1)[1] !== payload.length || spans.some((span, index) => index > 0 && spans[index - 1][1] !== span[0]))
    throw new RangeError("native state tensor payload has gaps or overlaps");
  if (verifiedId !== void 0) {
    if (id !== verifiedId) throw new RangeError(`native state content ID mismatch: ${String(id)}`);
    validateNativeState(metadata, tensors);
    return { id: verifiedId, metadata, tensors };
  }
  checkNativeStateFinite(tensors);
  const actual = nativeStateContentId(metadata, tensors);
  if (actual !== id) throw new RangeError(`native state content ID mismatch: ${actual}`);
  return { id: actual, metadata, tensors };
}
function nativeStateView(artifact) {
  return { id: artifact.id, metadata: structuredClone(artifact.metadata), tensors: Object.fromEntries(
    Object.entries(artifact.tensors).map(([name, tensor]) => [name, { ...tensor, shape: [...tensor.shape] }])
  ) };
}
var MemoryNeuraleseStore = class {
  /** Native states as their wires (kept as received) and the decoded views of them. */
  nativeStates = /* @__PURE__ */ new Map();
  nativeWires = /* @__PURE__ */ new Map();
  nativeTensorArtifacts = /* @__PURE__ */ new Map();
  /** Metadata of blocks held elsewhere (`note`). */
  noted = /* @__PURE__ */ new Map();
  pins = /* @__PURE__ */ new Map();
  async meta(id) {
    const found = this.peek(id);
    return found && { ...found };
  }
  async has(id) {
    return this.nativeStates.has(id) || this.nativeTensorArtifacts.has(id);
  }
  async putNativeState(artifact) {
    const { id, wire } = encodeNativeStateWire(artifact);
    return this.putNativeStateWire(wire, id);
  }
  async putNativeStateWire(wire, verifiedId) {
    const found = verifiedId !== void 0 ? this.nativeStates.get(verifiedId) : void 0;
    if (found) return nativeStateView(found);
    const stored = decodeNativeState(wire, verifiedId);
    if (stored.metadata.derivation) await verifyNativeStateDerivation(this, stored);
    if (!this.nativeStates.has(stored.id)) {
      this.nativeStates.set(stored.id, stored);
      this.nativeWires.set(stored.id, wire);
      this.noted.delete(stored.id);
    }
    return nativeStateView(this.nativeStates.get(stored.id));
  }
  async getNativeState(id) {
    const found = this.nativeStates.get(id);
    return found && nativeStateView(found);
  }
  async getNativeStateWire(id) {
    return this.nativeWires.get(id);
  }
  async hasNativeState(id) {
    return this.nativeStates.has(id);
  }
  async putNativeTensorArtifact(artifact) {
    await verifyNativeDerivativeGradientOrigin(this, artifact);
    const wire = encodeNativeTensorArtifact(artifact), stored = decodeNativeTensorArtifact(wire);
    const found = this.nativeTensorArtifacts.get(stored.id);
    if (found) return structuredClone(found);
    this.nativeTensorArtifacts.set(stored.id, stored);
    this.noted.delete(stored.id);
    return structuredClone(stored);
  }
  async getNativeTensorArtifact(id) {
    const found = this.nativeTensorArtifacts.get(id);
    return found && structuredClone(found);
  }
  async hasNativeTensorArtifact(id) {
    return this.nativeTensorArtifacts.has(id);
  }
  peek(id) {
    const native = this.nativeStates.get(id);
    const tensor = this.nativeTensorArtifacts.get(id);
    const found = (native && nativeStateBlockMeta(native)) ?? (tensor && nativeTensorArtifactBlockMeta(tensor)) ?? this.noted.get(id);
    return found && { ...found };
  }
  note(meta) {
    if (!this.nativeStates.has(meta.id) && !this.nativeTensorArtifacts.has(meta.id)) this.noted.set(meta.id, { ...meta });
  }
  async pin(id) {
    if (!this.nativeStates.has(id) && !this.nativeTensorArtifacts.has(id)) throw new Error(`neuralese-unknown-native-artifact: ${id}`);
    this.pins.set(id, (this.pins.get(id) ?? 0) + 1);
  }
  async unpin(id) {
    const count = (this.pins.get(id) ?? 0) - 1;
    if (count > 0) this.pins.set(id, count);
    else this.pins.delete(id);
  }
  async collect(referenced) {
    referenced = await nativeArtifactDependencyClosure(this, [...referenced, ...this.pins.keys()]);
    const removed = [];
    for (const id of [...this.nativeStates.keys(), ...this.nativeTensorArtifacts.keys()])
      if (!referenced.has(id) && !this.pins.has(id)) {
        this.nativeStates.delete(id);
        this.nativeWires.delete(id);
        this.nativeTensorArtifacts.delete(id);
        removed.push(id);
      }
    for (const id of [...this.noted.keys()]) if (!referenced.has(id)) this.noted.delete(id);
    return removed;
  }
  get size() {
    return this.nativeStates.size + this.nativeTensorArtifacts.size;
  }
};

export {
  digest,
  hexDigest,
  nativeModelIdentityEqual,
  nativeStateBlockMeta,
  nativeTensorArtifactBlockMeta,
  nativeTensorArtifactDependencies,
  nativeStateArtifactDependencies,
  archiveNativeArtifactFrom,
  archiveNativeTensorFrom,
  importNativeArtifactBundle,
  nativeArtifactDependencyClosure,
  validateNativeAdapterBinding,
  validateNativeAdapterStateConsumption,
  validateNativeInvocationActorReceipt,
  validateNativeInvocationBehaviorPolicy,
  nativeCanonicalJson,
  nativeTensorArtifactContentId,
  encodeNativeTensorArtifact,
  decodeNativeTensorArtifact,
  nativeStateContentId,
  encodeNativeState,
  encodeNativeStateWire,
  decodeNativeState,
  nativeStateView,
  MemoryNeuraleseStore,
  verifyNativeStateDerivationRecords
};
