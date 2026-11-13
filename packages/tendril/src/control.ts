/**
 * The tendril control (tendrils plan §4.7): a small corner button that shows
 * whether the agent is working, says when page events were held back, and
 * takes a typed instruction. Text that matches an exposed function's phrases
 * runs that function on the page; anything else goes to the agent as the
 * person's own message. Shadow DOM, so page styles never leak in or out.
 */
import { matchPhrase, type PhraseEntry } from "./phrases.js";
import type { AgentStatus, Tendril } from "./page.js";

export interface TendrilControl {
  hide(): void;
  show(): void;
  /** Handle one utterance exactly like the input box does. */
  submit(text: string, via?: "voice" | "text"): Promise<"function" | "agent">;
  remove(): void;
}

const STATUS_TEXT: Record<AgentStatus["state"], string> = {
  idle: "Agent is idle",
  working: "Agent is working…",
  waiting: "Agent is waiting for you",
  unattached: "No agent is attached",
};

export function mountTendrilControl(
  tendril: Tendril,
  opts: { position?: "bottom-right" | "bottom-left"; document?: Document } = {},
): TendrilControl {
  const doc = opts.document ?? document;
  const host = doc.createElement("div");
  host.setAttribute("data-tendril-control", "");
  const root = host.attachShadow({ mode: "open" });
  const side = opts.position === "bottom-left" ? "left" : "right";
  root.innerHTML = `
<style>
  :host { all: initial; position: fixed; bottom: 16px; ${side}: 16px; z-index: 2147483647;
    font: 14px/1.4 system-ui, sans-serif; color: #111; }
  button { font: inherit; cursor: pointer; }
  .fab { width: 44px; height: 44px; border-radius: 22px; border: 0; background: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,.25); display: grid; place-items: center; }
  .dot { width: 12px; height: 12px; border-radius: 6px; background: #9ca3af; }
  .dot[data-state="working"] { background: #2563eb; animation: pulse 1s infinite alternate; }
  .dot[data-state="waiting"] { background: #f59e0b; }
  .dot[data-state="idle"] { background: #10b981; }
  @keyframes pulse { to { opacity: .35; } }
  .sheet { position: absolute; bottom: 52px; ${side}: 0; width: min(320px, 90vw); background: #fff;
    border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,.25); padding: 12px; display: grid; gap: 8px; }
  .sheet[hidden] { display: none; }
  .note { font-size: 12px; color: #92400e; background: #fef3c7; border-radius: 6px; padding: 6px 8px; }
  .note[hidden] { display: none; }
  form { display: flex; gap: 6px; }
  input { flex: 1; font: inherit; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; }
  .send { border: 0; border-radius: 6px; background: #111; color: #fff; padding: 6px 10px; }
  .mic { border: 1px solid #d1d5db; border-radius: 6px; background: transparent; padding: 6px 8px; }
  .mic[aria-pressed="true"] { background: #fee2e2; border-color: #ef4444; }
  .mic[hidden] { display: none; }
  .result { font-size: 12px; color: #374151; min-height: 1em; }
  @media (prefers-color-scheme: dark) {
    :host { color: #f3f4f6; } .fab, .sheet { background: #1f2937; }
    input { background: #111827; color: inherit; border-color: #374151; }
    .send { background: #f3f4f6; color: #111; } .result { color: #d1d5db; }
  }
</style>
<button class="fab" aria-label="Tendril controls" aria-expanded="false"><span class="dot"></span></button>
<div class="sheet" hidden role="dialog" aria-label="Talk to the agent">
  <div class="status" role="status" aria-live="polite"></div>
  <div class="note" hidden></div>
  <form><input aria-label="Instruction" placeholder="Tell the agent…" autocomplete="off" />
    <button class="mic" type="button" aria-label="Speak" aria-pressed="false">🎙</button>
    <button class="send" type="submit">Send</button></form>
  <div class="result" aria-live="polite"></div>
</div>`;
  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const fab = $<HTMLButtonElement>(".fab");
  const dot = $<HTMLSpanElement>(".dot");
  const sheet = $<HTMLDivElement>(".sheet");
  const statusLine = $<HTMLDivElement>(".status");
  const note = $<HTMLDivElement>(".note");
  const form = $<HTMLFormElement>("form");
  const input = $<HTMLInputElement>("input");
  const result = $<HTMLDivElement>(".result");
  const mic = $<HTMLButtonElement>(".mic");
  mic.hidden = !doc.defaultView?.navigator.mediaDevices?.getUserMedia;
  let finishListening: (() => void) | null = null;

  const render = (status: AgentStatus) => {
    dot.dataset["state"] = status.state;
    statusLine.textContent = STATUS_TEXT[status.state];
    fab.title = STATUS_TEXT[status.state];
    note.hidden = status.withheld === 0;
    note.textContent =
      status.withheld === 0
        ? ""
        : `${status.withheld} update${status.withheld === 1 ? "" : "s"} from this page will reach the agent the next time you talk to it.`;
  };
  render(tendril.agent.status());
  const unsubscribe = tendril.agent.on(render);

  fab.addEventListener("click", () => {
    sheet.hidden = !sheet.hidden;
    fab.setAttribute("aria-expanded", String(!sheet.hidden));
    if (!sheet.hidden) input.focus();
  });

  const submit = async (text: string, via: "voice" | "text" = "text") => {
    const entries: PhraseEntry<string>[] = tendril
      .functions()
      .filter((fn) => fn.phrases?.length)
      .map((fn) => ({ key: fn.name, phrases: fn.phrases! }));
    const match = matchPhrase(text, entries);
    if (match) {
      const value = await tendril.call(match.key, match.args);
      result.textContent = value === undefined ? `Done: ${match.key}` : `${match.key}: ${String(value)}`;
      return "function" as const;
    }
    await tendril.instruct(text, via);
    result.textContent = "Sent to the agent.";
    return "agent" as const;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    submit(text).catch((error: unknown) => {
      result.textContent = `Could not send: ${error instanceof Error ? error.message : String(error)}`;
    });
  });

  mic.addEventListener("click", () => {
    if (finishListening) {
      finishListening();
      return;
    }
    const stop = new Promise<void>((resolve) => {
      finishListening = resolve;
    });
    mic.setAttribute("aria-pressed", "true");
    result.textContent = "Listening…";
    tendril
      .listen({ stop })
      .then((text) => {
        result.textContent = `“${text}”`;
        return submit(text, "voice");
      })
      .catch((error: unknown) => {
        result.textContent = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        finishListening = null;
        mic.setAttribute("aria-pressed", "false");
      });
  });

  doc.body.appendChild(host);
  return {
    hide: () => {
      host.style.display = "none";
    },
    show: () => {
      host.style.display = "";
    },
    submit,
    remove: () => {
      unsubscribe();
      host.remove();
    },
  };
}
