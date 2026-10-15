import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStdout } from "ink";
import type { ReadableStore } from "@workspace/agentic-core/chat-store";
import { KeyDecoder, type InputEvent } from "../model/keys.js";

const NEVER = () => () => {};

/** Subscribe to a chat-core store (or nothing, yielding `fallback`). */
export function useStore<T, F = T>(store: ReadableStore<T> | null | undefined, fallback: F): T | F {
  return useSyncExternalStore<T | F>(
    store ? store.subscribe : NEVER,
    store ? store.getSnapshot : () => fallback
  );
}

export interface TerminalSize {
  columns: number;
  rows: number;
}

/** The terminal's size as state, updated on every resize. */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const read = (): TerminalSize => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  return size;
}

/** Raw terminal input as chunks; the program feeds stdin, tests feed strings. */
export interface InputSource {
  subscribe(listener: (chunk: string) => void): () => void;
}

/**
 * Decode raw input into key, paste and focus events. The handler always sees
 * the latest render's closure.
 */
export function useInputEvents(input: InputSource, handler: (event: InputEvent) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const decoder = new KeyDecoder();
    return input.subscribe((chunk) => {
      for (const event of decoder.push(chunk)) handlerRef.current(event);
    });
  }, [input]);
}
