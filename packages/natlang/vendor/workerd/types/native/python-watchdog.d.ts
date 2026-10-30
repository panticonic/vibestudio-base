/** The timer that interrupts a Python cell (native/folder-python.ts), by platform. */
/**
 * Starts a timer outside the interpreter's thread that sets the interrupt flag (`buffer`, an Int32Array's) to 2 after
 * `ms` (Pyodide then raises KeyboardInterrupt). A platform supplies one (`Platform.pythonWatchdog`): browsers use a
 * Web Worker (`webWorkerWatchdog`), Node worker_threads (runtime/node.ts).
 */
export type PythonWatchdog = (buffer: SharedArrayBuffer, ms: number) => {
    terminate(): Promise<unknown> | unknown;
} | undefined;
export declare const WATCHDOG_SCRIPT = "const flag = new Int32Array(buffer); setTimeout(() => { const interrupt = () => Atomics.store(flag, 0, 2); interrupt(); setInterval(interrupt, Math.max(1, Math.min(25, ms))); }, ms)";
export declare const webWorkerWatchdog: PythonWatchdog;
