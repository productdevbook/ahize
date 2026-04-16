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

interface LiveChatWidget {
  call(method: string, ...args: unknown[]): void;
  on(event: string, cb: (payload: unknown) => void): void;
  off(event: string, cb: (payload: unknown) => void): void;
  get<T = unknown>(method: string): T;
}

interface LiveChatWindow {
  __lc?: { license: number; integration_name?: string; product_name?: string };
  LiveChatWidget?: LiveChatWidget;
}

function w(): LiveChatWindow {
  return globalThis as unknown as LiveChatWindow;
}

const queue = createQueue<LiveChatWidget>();
const store = createIdentityStore();
const lifecycle = createLifecycle();
let readyPromise: Promise<void> | undefined;
let readyResolve: (() => void) | undefined;

export interface LiveChatLoadOptions extends LoadOptions {
  license: number;
}

export async function load(options: LiveChatLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (options.consent === false) return;
  const h = hashConfig({ license: options.license });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
  readyPromise = new Promise((r) => {
    readyResolve = r;
  });
  await waitForDefer(options.defer ?? "immediate");

  w().__lc = { license: options.license, integration_name: "ahize" };

  try {
    await injectScript({
      id: "ahize-livechat",
      src: "https://cdn.livechatinc.com/tracking.js",
      nonce: options.nonce,
      partytown: options.partytown,
    });
  } catch (error) {
    lifecycle.transition("idle");
    lifecycle.clearConfigHash();
    throw error;
  }

  // Poll briefly for the widget to attach.
  for (let i = 0; i < 80; i++) {
    const widget = w().LiveChatWidget;
    if (widget) {
      queue.ready(widget);
      widget.on("ready", () => readyResolve?.());
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
  return queue.enqueue((widget) => {
    if (identity.email) widget.call("set_customer_email", identity.email);
    if (identity.name) widget.call("set_customer_name", identity.name);
    if (identity.attributes) {
      widget.call("update_session_variables", identity.attributes);
    }
  });
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((widget) => {
    widget.call("update_session_variables", { [event]: metadata });
  });
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve();
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((widget) => widget.call("maximize"));
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((widget) => widget.call("hide"));
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue
    .enqueue((widget) => widget.call("destroy"))
    .then(() => {
      store.reset();
      lifecycle.transition("shutdown");
    });
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  removeScript("ahize-livechat");
  const g = w();
  Reflect.deleteProperty(g, "__lc");
  Reflect.deleteProperty(g, "LiveChatWidget");
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
