import { isBrowser } from "./_loader.ts";

export type DeferStrategy = "immediate" | "idle" | "interaction" | "manual";

interface WindowWithIdle {
  requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  addEventListener?: (type: string, listener: () => void, opts?: unknown) => void;
  removeEventListener?: (type: string, listener: () => void, opts?: unknown) => void;
}

function win(): WindowWithIdle | undefined {
  if (!isBrowser()) return undefined;
  return globalThis as unknown as WindowWithIdle;
}

const INTERACTION_EVENTS = ["pointerdown", "scroll", "keydown", "touchstart"] as const;

export function waitForDefer(strategy: DeferStrategy, timeoutMs = 10_000): Promise<void> {
  if (strategy === "immediate") return Promise.resolve();
  if (strategy === "manual") return new Promise(() => {});
  const w = win();
  if (!w) return Promise.resolve();

  if (strategy === "idle") {
    return new Promise<void>((resolve) => {
      if (w.requestIdleCallback) {
        w.requestIdleCallback(() => resolve(), { timeout: timeoutMs });
      } else {
        w.setTimeout(() => resolve(), 200);
      }
    });
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    const off: Array<() => void> = [];
    const cleanup = () => {
      if (settled) return;
      settled = true;
      for (const fn of off) fn();
      resolve();
    };
    for (const evt of INTERACTION_EVENTS) {
      const handler = () => cleanup();
      w.addEventListener?.(evt, handler, { once: true, passive: true });
      off.push(() => w.removeEventListener?.(evt, handler));
    }
    const timer = w.setTimeout(cleanup, timeoutMs);
    off.push(() => w.clearTimeout(timer));
  });
}
