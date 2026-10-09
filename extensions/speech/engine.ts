/** The upstream engine is synchronous and process-global. A worker owns its
 * memory and makes cancellation authoritative: terminate and join that worker. */
export const engineSource = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const { readFileSync } = require("node:fs");
const path = require("node:path");
(async () => {
  const engine = await require(path.join(workerData, "needle.cjs"))({
    wasmBinary: readFileSync(path.join(workerData, "needle.wasm"))
  });
  const allocate = (size) => {
    const pointer = engine._malloc(size);
    if (!pointer) throw new Error("Whistle allocation failed");
    return pointer;
  };
  const check = (status) => {
    if (status < 0) throw new Error(engine.UTF8ToString(engine._needle_last_error()) || "Whistle inference failed");
  };
  const weights = readFileSync(path.join(workerData, "whistle.cact"));
  const model = allocate(weights.length);
  try {
    engine.HEAPU8.set(weights, model);
    check(engine._needle_load(model, BigInt(weights.length)));
  } finally { engine._free(model); }
  parentPort.postMessage({ type: "ready" });
  parentPort.on("message", (audio) => {
    try {
      const output = allocate(65536);
      const input = allocate(30 * 16000 * 4);
      const texts = [];
      let language = "";
      const consume = () => {
        const result = JSON.parse(engine.UTF8ToString(output));
        if (typeof result.text !== "string" || typeof result.language !== "string")
          throw new Error("Invalid Whistle result");
        if (result.text) texts.push(result.text);
        if (result.language) language = result.language;
      };
      try {
        // Each batch is bounded by the model's 30-second attention window.
        // Split longer recordings at the quietest 100 ms in its last five seconds.
        let start = 0;
        while (start < audio.length) {
          let end = Math.min(start + 30 * 16000, audio.length);
          if (end < audio.length) {
            let quietest = Infinity;
            for (let candidate = start + 25 * 16000; candidate <= start + 30 * 16000; candidate += 160) {
              let energy = 0;
              for (let i = candidate - 1600; i < candidate; i++) energy += audio[i] ** 2;
              if (energy < quietest) { quietest = energy; end = candidate; }
            }
          }
          const chunk = audio.subarray(start, end);
          new Float32Array(engine.HEAPU8.buffer, input, chunk.length).set(chunk);
          check(engine._needle_transcribe(input, chunk.length, 0, 0, 0, output, 65536));
          consume();
          parentPort.postMessage({ type: "progress", message: "Transcribing…", completed: end, total: audio.length });
          start = end;
        }
        parentPort.postMessage({ type: "result", text: texts.join(" "), model: "whistle", language });
      } finally { engine._free(input); engine._free(output); }
    } catch (error) { throw error; }
  });
})().catch((error) => { throw error; });
`;
