import type { ReadableStore } from "@workspace/agentic-core/chat-store";

/** A store holding one immutable value that is replaced as a whole. */
export class ValueStore<T> implements ReadableStore<T> {
  #value: T;
  readonly #listeners = new Set<() => void>();

  constructor(initial: T) {
    this.#value = initial;
  }

  readonly getSnapshot = (): T => this.#value;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  set(value: T): void {
    if (Object.is(value, this.#value)) return;
    this.#value = value;
    for (const listener of [...this.#listeners]) listener();
  }
}
