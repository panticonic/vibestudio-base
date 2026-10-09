# Offline dictation

The Base speech extension owns Whistle, its artifacts, and inference. There is
no speech service, native speech bundle, or model path in the app host.
The chat composer calls `extensions.invoke` for `status` and
`extensions.invokeStream` for `prepare` and `transcribe` on
`@workspace-extensions/speech`. The protocol types live in `@workspace/speech`.

Preparation downloads the original Whistle `.cact`, Needle's WebAssembly engine
and loader, and both Apache 2.0 licenses from immutable Hugging Face revisions.
Every artifact is SHA-256 checked before publication and on subsequent loads.
They remain in an immutable generation under the extension's workspace storage.
Incomplete downloads are never loaded. A failed download can be explicitly
retried; corrupt cached resources fail with their integrity error. After initial
preparation, inference and subsequent loads need no network access.

One resident Node worker thread owns upstream's synchronous, non-thread-safe
engine. Calls serialize through that owner. Cancellation, caller disconnect,
and extension deactivation terminate and join the worker, settling active and
queued work. The original download or engine error reaches the caller through
the ordinary extension response stream. There are no production deadlines or
automatic retries. Audio and transcripts are invocation data and never written
to storage. Microphone capture and resampling stay in the browser.

Recordings are mono 16 kHz float32 PCM, bounded to 4 MiB so base64 plus metadata
fit Iroh's 8 MiB envelope. Batch inference accepts up to 30 seconds. Longer recordings split at the quietest
100 ms in the last five seconds of that input window, retaining the existing
recording budget without discarding audio.
The model detects English, German, French, Spanish, Italian, Dutch, and Polish.
Silence can return an empty transcript.

Run verification from the Vibestudio host checkout, through its userland
projection:

```sh
pnpm test:userland -- --template base --filter extensions/speech --filter packages/agentic-chat/hooks/useDictation.test.tsx --filter packages/agentic-chat/components/ChatInput.test.tsx
pnpm type-check:userland -- --template base
pnpm check:template-checkout-hygiene
```

The real-engine integration test downloads to a private cache, checks the JFK
recording with a resident worker and again after an offline reload, checks a
44-second repeated recording across the input-window boundary, then joins the
worker and removes the cache. Unit tests cover integrity, download cancellation, malformed PCM,
serialization, inference cancellation, original error propagation, and shutdown.
The JFK fixture is a public-domain inaugural-address excerpt originally used
by OpenAI Whisper's test suite.

Sources: https://huggingface.co/Cactus-Compute/whistle and
https://huggingface.co/Cactus-Compute/needle3. Artifact coordinates are in
`artifacts.ts`. The unmodified upstream loader is cached as CommonJS; the
engine loads the original weights without conversion or requantization.
