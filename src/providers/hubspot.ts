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

interface HubSpotConversations {
  widget: {
    load(options?: { widgetOpen?: boolean }): void;
    open(): void;
    close(): void;
    remove(): void;
    refresh(options?: { openToNewThread?: boolean }): void;
  };
  clear(options?: { resetWidget?: boolean }): void;
  on(event: string, listener: (payload: unknown) => void): void;
  off(event: string, listener: (payload: unknown) => void): void;
}

interface HubSpotWindow {
  HubSpotConversations?: HubSpotConversations;
  hsConversationsSettings?: Record<string, unknown>;
  hsConversationsOnReady?: Array<() => void>;
  _hsq?: unknown[];
}

function w(): HubSpotWindow {
  return globalThis as unknown as HubSpotWindow;
}

function hsq(): unknown[] {
  const g = w();
  if (!g._hsq) g._hsq = [];
  return g._hsq;
}

const conversations = createQueue<HubSpotConversations>();
const store = createIdentityStore();
const lifecycle = createLifecycle();

export interface HubSpotLoadOptions extends LoadOptions {
  portalId: string;
  region?: "na1" | "eu1";
}

function lowercaseKeys<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v;
  return out;
}

export async function load(options: HubSpotLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (options.consent === false) return;
  const h = hashConfig({ portalId: options.portalId, region: options.region });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
  await waitForDefer(options.defer ?? "immediate");

  w().hsConversationsSettings = { loadImmediately: false };

  if (!w().hsConversationsOnReady) w().hsConversationsOnReady = [];
  w().hsConversationsOnReady!.push(() => {
    const api = w().HubSpotConversations;
    if (api) conversations.ready(api);
  });

  const host = options.region === "eu1" ? "js-eu1.hs-scripts.com" : "js.hs-scripts.com";
  try {
    await injectScript({
      id: "ahize-hubspot",
      src: `//${host}/${options.portalId}.js`,
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
  if (identity.verification && identity.verification.kind !== "jwt") {
    return Promise.reject(new Error("HubSpot requires JWT verification (kind: 'jwt')"));
  }
  if (identity.email && !identity.verification) {
    console.warn(
      "[ahize/hubspot] identify() called with email but no JWT — HubSpot treats the session as anonymous until identificationToken is provided.",
    );
  }
  store.identify(identity);
  const props = lowercaseKeys({
    email: identity.email,
    id: identity.id,
    ...identity.attributes,
  });
  hsq().push(["identify", props]);
  if (identity.verification?.kind === "jwt") {
    const settings = w().hsConversationsSettings ?? {};
    w().hsConversationsSettings = {
      ...settings,
      identificationEmail: identity.email,
      identificationToken: identity.verification.token,
    };
  }
  return Promise.resolve();
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  hsq().push(["trackEvent", { id: event, value: metadata }]);
  return Promise.resolve();
}

export function refresh(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return conversations.enqueue((api) => {
    api.widget.refresh({ openToNewThread: false });
  });
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return conversations.enqueue((api) => {
    api.widget.load({ widgetOpen: true });
    api.widget.open();
  });
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return conversations.enqueue((api) => {
    api.widget.close();
  });
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return conversations
    .enqueue((api) => {
      api.widget.remove();
      api.clear({ resetWidget: true });
    })
    .then(() => {
      store.reset();
      lifecycle.transition("shutdown");
    });
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  removeScript("ahize-hubspot");
  const g = w();
  Reflect.deleteProperty(g, "HubSpotConversations");
  Reflect.deleteProperty(g, "hsConversationsSettings");
  Reflect.deleteProperty(g, "hsConversationsOnReady");
  Reflect.deleteProperty(g, "_hsq");
  conversations.reset();
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
