import { waitForDefer } from "../_defer.ts";
import { createIdentityStore } from "../_identity.ts";
import { createLifecycle, hashConfig } from "../_lifecycle.ts";
import { injectScript, isBrowser, removeScript } from "../_loader.ts";
import { createQueue } from "../_queue.ts";
import type {
  EventMetadata,
  Identity,
  IdentityListener,
  IdentityState,
  LoadOptions,
} from "../_types.ts";

interface JivoAPI {
  setContactInfo(info: {
    name?: string;
    email?: string;
    phone?: string;
    description?: string;
  }): void;
  open(): void;
  close(): void;
  clearHistory(): void;
}

interface JivoWindow {
  jivo_api?: JivoAPI;
  jivo_onLoadCallback?: () => void;
  jivo_onOpen?: () => void;
  jivo_onClose?: () => void;
  jivo_onMessageSent?: (msg: unknown) => void;
}

function w(): JivoWindow {
  return globalThis as unknown as JivoWindow;
}

const queue = createQueue<JivoAPI>();
const store = createIdentityStore();
const lifecycle = createLifecycle();
let readyPromise: Promise<void> | undefined;
let readyResolve: (() => void) | undefined;
const openListeners = new Set<() => void>();
const closeListeners = new Set<() => void>();
const messageListeners = new Set<(msg: unknown) => void>();

// Token bucket: 9 calls per hour to stay under JivoChat's 10/hr limit.
const RATE_LIMIT_MAX = 9;
const RATE_WINDOW_MS = 60 * 60 * 1000;
let bucket: number[] = [];
function takeContactInfoToken(): boolean {
  const now = Date.now();
  bucket = bucket.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) return false;
  bucket.push(now);
  return true;
}

export interface JivoChatLoadOptions extends LoadOptions {
  widgetId: string;
}

export async function load(options: JivoChatLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (options.consent === false) return;
  const h = hashConfig({ widgetId: options.widgetId });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
  readyPromise = new Promise((r) => {
    readyResolve = r;
  });
  await waitForDefer(options.defer ?? "immediate");

  // Multi-listener bridge — JivoChat allows only one global callback per event.
  w().jivo_onLoadCallback = () => readyResolve?.();
  w().jivo_onOpen = () => {
    for (const l of openListeners) l();
  };
  w().jivo_onClose = () => {
    for (const l of closeListeners) l();
  };
  w().jivo_onMessageSent = (msg) => {
    for (const l of messageListeners) l(msg);
  };

  try {
    await injectScript({
      id: "ahize-jivochat",
      src: `//code.jivosite.com/widget/${options.widgetId}`,
      nonce: options.nonce,
      partytown: options.partytown,
    });
  } catch (error) {
    lifecycle.transition("idle");
    lifecycle.clearConfigHash();
    throw error;
  }

  for (let i = 0; i < 80; i++) {
    const api = w().jivo_api;
    if (api) {
      queue.ready(api);
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  lifecycle.transition("ready");
}

export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve();
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  if (!takeContactInfoToken()) {
    console.warn(
      "[ahize/jivochat] setContactInfo throttled (>9 calls/hour); skipped to stay under JivoChat's rate limit.",
    );
    return Promise.resolve();
  }
  store.identify(identity);
  return queue.enqueue((api) => {
    api.setContactInfo({
      name: identity.name,
      email: identity.email,
      phone: identity.phone,
    });
  });
}

export function track<T extends EventMetadata = EventMetadata>(
  _event: string,
  _metadata?: T,
): Promise<void> {
  // JivoChat has no native event tracking surface; fold into setContactInfo.description if needed.
  return Promise.resolve();
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve();
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => api.open());
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => api.close());
}

export function on(
  event: "open" | "close" | "message",
  listener: (payload?: unknown) => void,
): () => void {
  const set =
    event === "open" ? openListeners : event === "close" ? closeListeners : messageListeners;
  set.add(listener as () => void);
  return () => set.delete(listener as () => void);
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue
    .enqueue((api) => api.clearHistory())
    .then(() => {
      store.reset();
      lifecycle.transition("shutdown");
    });
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  removeScript("ahize-jivochat");
  const g = w();
  for (const k of [
    "jivo_api",
    "jivo_onLoadCallback",
    "jivo_onOpen",
    "jivo_onClose",
    "jivo_onMessageSent",
  ]) {
    Reflect.deleteProperty(g, k);
  }
  queue.reset();
  store.reset();
  openListeners.clear();
  closeListeners.clear();
  messageListeners.clear();
  bucket = [];
  readyPromise = undefined;
  readyResolve = undefined;
  lifecycle.clearConfigHash();
  lifecycle.transition("idle");
}

export function getIdentity(): IdentityState {
  return store.get();
}

export function onIdentityChange(listener: IdentityListener): () => void {
  return store.onChange(listener);
}

export function isReady(): boolean {
  return lifecycle.state() === "ready";
}

export function state(): "idle" | "loading" | "ready" | "shutdown" {
  return lifecycle.state();
}
