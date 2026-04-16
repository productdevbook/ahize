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

interface TawkAPI {
  onLoad?: () => void;
  visitor?: Record<string, unknown>;
  setAttributes?: (attrs: Record<string, unknown>, cb?: (err?: Error) => void) => void;
  addEvent?: (
    event: string,
    metadata?: Record<string, unknown>,
    cb?: (err?: Error) => void,
  ) => void;
  showWidget?: () => void;
  hideWidget?: () => void;
  endChat?: () => void;
  switchWidget?: (data: { propertyId: string; widgetId: string }) => void;
}

interface TawkWindow {
  Tawk_API?: TawkAPI;
  Tawk_LoadStart?: Date;
}

function w(): TawkWindow {
  return globalThis as unknown as TawkWindow;
}

function api(): TawkAPI {
  const g = w();
  if (!g.Tawk_API) g.Tawk_API = {};
  return g.Tawk_API;
}

const queue = createQueue<TawkAPI>();
const store = createIdentityStore();
const lifecycle = createLifecycle();

export interface TawkLoadOptions extends LoadOptions {
  propertyId: string;
  widgetId?: string;
}

export async function load(options: TawkLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  const h = hashConfig({ propertyId: options.propertyId, widgetId: options.widgetId });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
  const a = api();
  w().Tawk_LoadStart = new Date();
  a.onLoad = () => queue.ready(a);

  const widget = options.widgetId ?? "default";
  try {
    await injectScript({
      id: "ahize-tawk",
      src: `https://embed.tawk.to/${options.propertyId}/${widget}`,
      nonce: options.nonce,
    });
  } catch (error) {
    lifecycle.transition("idle");
    lifecycle.clearConfigHash();
    throw error;
  }
  lifecycle.transition("ready");
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  if (identity.verification && identity.verification.kind !== "hmac") {
    return Promise.reject(new Error("Tawk requires HMAC verification (kind: 'hmac')"));
  }
  store.identify(identity);
  return queue.enqueue((a) => {
    const attrs: Record<string, unknown> = {};
    if (identity.name) attrs["name"] = identity.name;
    if (identity.email) attrs["email"] = identity.email;
    if (identity.verification?.kind === "hmac") attrs["hash"] = identity.verification.hash;
    if (identity.attributes) Object.assign(attrs, identity.attributes);
    a.setAttributes?.(attrs, (err) => {
      if (err) console.warn("[ahize/tawk] setAttributes failed", err);
    });
  });
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((a) => {
    a.addEvent?.(event, metadata);
  });
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((a) => {
    a.showWidget?.();
  });
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((a) => {
    a.hideWidget?.();
  });
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue
    .enqueue((a) => {
      a.endChat?.();
    })
    .then(() => {
      store.reset();
      lifecycle.transition("shutdown");
    });
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  removeScript("ahize-tawk");
  const g = w();
  Reflect.deleteProperty(g, "Tawk_API");
  Reflect.deleteProperty(g, "Tawk_LoadStart");
  queue.reset();
  store.reset();
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
