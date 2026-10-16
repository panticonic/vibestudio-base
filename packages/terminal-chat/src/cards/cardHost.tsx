/**
 * Live cards in the transcript. Each card (an MDX message, an inline UI) is
 * its own Ink tree, mounted once and kept: its state lives as long as the
 * conversation is open. It renders offscreen at the transcript's width, and
 * its latest frame becomes the lines of its row.
 *
 * The person reaches a card two ways: a click presses whatever is drawn
 * under it (located with Ink's own layout), and a focused card receives the
 * keys, so Tab moves between its controls and agent code may read keys with
 * Ink's `useInput` / `useFocus` as in any Ink app.
 */
import { EventEmitter } from "node:events";
import React from "react";
import { render, Text, type Instance } from "ink";
import {
  ClickTargets,
  ClickTargetsContext,
  ResponseActionsProvider,
  type ResponseActions,
} from "@workspace/terminal-ui";
import { compileInlineCard, compileMdxCard } from "./modules.js";

export type CardSpec =
  | { kind: "mdx"; content: string }
  | { kind: "inline"; id: string; source: string; props: Record<string, unknown> };

/** What a card can reach of its conversation. */
export interface CardEnvironment {
  actions: ResponseActions;
  /** Handed to inline UI as its `chat` prop: send and publish, as in the panel. */
  chat: Record<string, unknown>;
  /** A card failed to compile or draw: the agent that wrote it should hear. */
  onFailure(key: string, spec: CardSpec, phase: "compile" | "render", error: Error): void;
}

export interface CardView {
  status: "compiling" | "ready" | "failed";
  lines: string[];
  error?: Error;
}

/** Each write is one complete frame (Ink's debug mode). */
class FrameStdout extends EventEmitter {
  readonly isTTY = true;
  rows = 1000;
  constructor(
    public columns: number,
    private readonly onFrame: (frame: string) => void
  ) {
    super();
  }
  write(chunk: string | Uint8Array, encodingOrCallback?: unknown, callback?: () => void): boolean {
    this.onFrame(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (typeof done === "function") queueMicrotask(done as () => void);
    return true;
  }
}

/** The keys a focused card receives, in Ink's readable-stream shape. */
class CardStdin extends EventEmitter {
  readonly isTTY = true;
  private readonly queue: string[] = [];
  push(data: string): void {
    this.queue.push(data);
    this.emit("readable");
  }
  read(): string | null {
    return this.queue.shift() ?? null;
  }
  setRawMode(): this {
    return this;
  }
  setEncoding(): this {
    return this;
  }
  ref(): this {
    return this;
  }
  unref(): this {
    return this;
  }
  resume(): this {
    return this;
  }
  pause(): this {
    return this;
  }
}

interface Card {
  signature: string;
  spec: CardSpec;
  status: CardView["status"];
  error?: Error;
  lines: string[];
  component?: React.ComponentType<Record<string, unknown>>;
  instance?: Instance;
  stdout?: FrameStdout;
  stdin: CardStdin;
  targets: ClickTargets;
}

class CardBoundary extends React.Component<
  { onError: (error: Error) => void; children?: React.ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error): void {
    this.props.onError(error);
  }
  override render(): React.ReactNode {
    if (this.state.error)
      return (
        <Text color="red">{`▣ This card could not be drawn: ${this.state.error.message}`}</Text>
      );
    return this.props.children;
  }
}

export class CardHost {
  private readonly cards = new Map<string, Card>();
  private environment: CardEnvironment | null = null;
  private notify = false;

  constructor(private readonly onChange: () => void) {}

  /** The conversation the cards talk to; cards redraw when it changes (answers, connection). */
  setEnvironment(environment: CardEnvironment): void {
    if (this.environment === environment) return;
    this.environment = environment;
    for (const [key, card] of this.cards) if (card.component) this.draw(key, card);
  }

  /** The card for `key` at `width`: mounted on first sight, recompiled when its source changes. */
  view(key: string, spec: CardSpec, width: number): CardView {
    const signature = JSON.stringify(spec);
    let card = this.cards.get(key);
    if (!card || card.signature !== signature) {
      card?.instance?.unmount();
      card = {
        signature,
        spec,
        status: "compiling",
        lines: [],
        stdin: new CardStdin(),
        targets: new ClickTargets(),
      };
      this.cards.set(key, card);
      this.compile(key, card, width);
    } else if (card.stdout && card.stdout.columns !== width) {
      card.stdout.columns = width;
      card.stdout.emit("resize");
    }
    return { status: card.status, lines: card.lines, ...(card.error ? { error: card.error } : {}) };
  }

  /** Press what is drawn at card-relative cell (x, y); false when nothing is. */
  press(key: string, x: number, y: number): boolean {
    return this.cards.get(key)?.targets.press(x, y) ?? false;
  }

  /** Keys (as terminal bytes) for the focused card. */
  input(key: string, bytes: string): void {
    this.cards.get(key)?.stdin.push(bytes);
  }

  /** Whether `key` is a card that is drawn and can take the keyboard. */
  isLive(key: string): boolean {
    return this.cards.get(key)?.status === "ready";
  }

  /** Unmount cards no longer in the transcript. */
  retain(keys: ReadonlySet<string>): void {
    for (const [key, card] of this.cards)
      if (!keys.has(key)) {
        card.instance?.unmount();
        this.cards.delete(key);
      }
  }

  dispose(): void {
    for (const card of this.cards.values()) card.instance?.unmount();
    this.cards.clear();
  }

  private compile(key: string, card: Card, width: number): void {
    const compiled =
      card.spec.kind === "mdx"
        ? compileMdxCard(card.spec.content)
        : compileInlineCard(card.spec.source);
    compiled.then(
      (component) => {
        if (this.cards.get(key) !== card) return;
        card.component = component as React.ComponentType<Record<string, unknown>>;
        card.status = "ready";
        card.stdout = new FrameStdout(width, (frame) => {
          const lines = frame.replace(/\n+$/u, "").split("\n");
          if (lines.join("\n") === card.lines.join("\n")) return;
          card.lines = lines;
          this.changed();
        });
        this.draw(key, card);
      },
      (error: unknown) => {
        if (this.cards.get(key) !== card) return;
        card.status = "failed";
        card.error = error instanceof Error ? error : new Error(String(error));
        this.environment?.onFailure(key, card.spec, "compile", card.error);
        this.changed();
      }
    );
  }

  private draw(key: string, card: Card): void {
    const environment = this.environment;
    const Component = card.component;
    if (!environment || !Component || !card.stdout) return;
    const spec = card.spec;
    const element = (
      <ClickTargetsContext.Provider value={card.targets}>
        <ResponseActionsProvider actions={environment.actions}>
          <CardBoundary onError={(error) => environment.onFailure(key, spec, "render", error)}>
            {spec.kind === "inline" ? (
              <Component props={spec.props} chat={environment.chat} inlineUi={{ id: spec.id }} />
            ) : (
              <Component />
            )}
          </CardBoundary>
        </ResponseActionsProvider>
      </ClickTargetsContext.Provider>
    );
    if (card.instance) card.instance.rerender(element);
    else
      card.instance = render(element, {
        stdout: card.stdout as unknown as NodeJS.WriteStream,
        stdin: card.stdin as unknown as NodeJS.ReadStream,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false,
      });
  }

  /** One redraw of the chat per burst of card frames, never inside its own render. */
  private changed(): void {
    if (this.notify) return;
    this.notify = true;
    setImmediate(() => {
      this.notify = false;
      this.onChange();
    });
  }
}
