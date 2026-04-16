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

interface TidioAPI {
  setVisitorData(data: {
    distinct_id?: string;
    email?: string;
    name?: string;
    phone?: string;
    tags?: string[];
  }): void;
  setContactProperties(props: Record<string, unknown>): void;
  show(): void;
  hide(): void;
  open(): void;
  close(): void;
  display?(state: boolean): void;
  messageFromOperator?(message: string): void;
}

interface TidioWindow {
  tidioChatApi?: TidioAPI;
}

function w(): TidioWindow {
  return globalThis as unknown as TidioWindow;
}

const queue = createQueue<TidioAPI>();
const store = createIdentityStore();
const lifecycle = createLifecycle();
let readyPromise: Promise<void> | undefined;
let readyResolve: (() => void) | undefined;

const TIDIO_EVENTS = {
  ready: "tidioChat-ready",
  messageFromVisitor: "tidioChat-messageFromVisitor",
  messageFromOperator: "tidioChat-messageFromOperator",
  visitorJoined: "tidioChat-visitorJoined",
} as const;

type TidioEventName = keyof typeof TIDIO_EVENTS;
const eventListeners = new Map<TidioEventName, Set<(payload: unknown) => void>>();
const domHandlers = new Map<TidioEventName, () => void>();

function bindDomEvent(event: TidioEventName): void {
  if (!isBrowser() || domHandlers.has(event)) return;
  const handler = (e: unknown) => {
    const detail = (e as { detail?: unknown } | undefined)?.detail;
    const set = eventListeners.get(event);
    if (set) for (const l of set) l(detail);
  };
  document.addEventListener(TIDIO_EVENTS[event], handler);
  domHandlers.set(event, () => document.removeEventListener(TIDIO_EVENTS[event], handler));
}

export interface TidioLoadOptions extends LoadOptions {
  publicKey: string;
}

export async function load(options: TidioLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (options.consent === false) return;
  const h = hashConfig({ publicKey: options.publicKey });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
  readyPromise = new Promise((r) => {
    readyResolve = r;
  });
  await waitForDefer(options.defer ?? "immediate");

  bindDomEvent("ready");
  bindDomEvent("messageFromVisitor");
  bindDomEvent("messageFromOperator");
  bindDomEvent("visitorJoined");

  document.addEventListener(TIDIO_EVENTS.ready, () => readyResolve?.(), { once: true } as never);

  try {
    await injectScript({
      id: "ahize-tidio",
      src: `//code.tidio.co/${options.publicKey}.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    });
  } catch (error) {
    lifecycle.transition("idle");
    lifecycle.clearConfigHash();
    throw error;
  }

  for (let i = 0; i < 80; i++) {
    const api = w().tidioChatApi;
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
  store.identify(identity);
  return queue.enqueue((api) => {
    api.setVisitorData({
      distinct_id: identity.id,
      email: identity.email,
      name: identity.name,
      phone: identity.phone,
    });
    if (identity.attributes) api.setContactProperties(identity.attributes);
  });
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => api.setContactProperties({ [event]: metadata }));
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve();
}

export function on(event: TidioEventName, listener: (payload: unknown) => void): () => void {
  let set = eventListeners.get(event);
  if (!set) {
    set = new Set();
    eventListeners.set(event, set);
  }
  set.add(listener);
  return () => set?.delete(listener);
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => {
    api.show();
    api.open();
  });
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => api.hide());
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  store.reset();
  lifecycle.transition("shutdown");
  return Promise.resolve();
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  for (const off of domHandlers.values()) off();
  domHandlers.clear();
  eventListeners.clear();
  removeScript("ahize-tidio");
  const g = w();
  Reflect.deleteProperty(g, "tidioChatApi");
  queue.reset();
  store.reset();
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
