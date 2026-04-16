import { ScriptLoadError } from "./errors.ts";

export interface InjectOptions {
  src: string;
  id?: string;
  async?: boolean;
  defer?: boolean;
}

const pending = new Map<string, Promise<void>>();

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function injectScript(opts: InjectOptions): Promise<void> {
  if (!isBrowser()) return Promise.resolve();

  const key = opts.id ?? opts.src;
  const existing = pending.get(key);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = opts.src;
    script.async = opts.async ?? true;
    script.defer = opts.defer ?? false;
    if (opts.id) script.id = opts.id;

    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new ScriptLoadError(`Failed to load script: ${opts.src}`)),
    );

    const head = document.getElementsByTagName("script")[0];
    if (head?.parentNode) {
      head.parentNode.insertBefore(script, head);
    } else {
      document.head.appendChild(script);
    }
  });

  pending.set(key, promise);
  return promise;
}
