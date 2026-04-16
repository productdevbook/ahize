import { createIdentityStore } from "../_identity.ts";
import { injectScript, isBrowser } from "../_loader.ts";
import { createQueue } from "../_queue.ts";
import type { Identity, IdentityListener, IdentityState, LoadOptions } from "../_types.ts";

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

export interface TawkLoadOptions extends LoadOptions {
  propertyId: string;
  widgetId?: string;
}

export async function load(options: TawkLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (queue.isReady()) return;

  const a = api();
  w().Tawk_LoadStart = new Date();
  a.onLoad = () => queue.ready(a);

  const widget = options.widgetId ?? "default";
  await injectScript({
    id: "ahize-tawk",
    src: `https://embed.tawk.to/${options.propertyId}/${widget}`,
  });
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
    a.setAttributes?.(attrs);
  });
}

export function track(event: string, metadata?: Record<string, unknown>): Promise<void> {
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
  return queue.enqueue((a) => {
    a.endChat?.();
    store.reset();
    queue.reset();
  });
}

export function getIdentity(): IdentityState {
  return store.get();
}

export function onIdentityChange(listener: IdentityListener): () => void {
  return store.onChange(listener);
}
