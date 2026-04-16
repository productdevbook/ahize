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

interface ChatwootSDK {
  run(options: { websiteToken: string; baseUrl: string }): void;
}

interface ChatwootAPI {
  setUser(identifier: string, user: Record<string, unknown>): void;
  setCustomAttributes(attrs: Record<string, unknown>): void;
  setConversationCustomAttributes?(attrs: Record<string, unknown>): void;
  setLabel(label: string): void;
  removeLabel?(label: string): void;
  setLocale?(locale: string): void;
  toggle(state?: "open" | "close"): void;
  toggleBubbleVisibility?(state: "show" | "hide"): void;
  reset(): void;
  isOpen?: boolean;
}

interface ChatwootWindow {
  chatwootSDK?: ChatwootSDK;
  $chatwoot?: ChatwootAPI;
  chatwootSettings?: Record<string, unknown>;
}

function w(): ChatwootWindow {
  return globalThis as unknown as ChatwootWindow;
}

const queue = createQueue<ChatwootAPI>();
const store = createIdentityStore();
const lifecycle = createLifecycle();
let currentToken: string | undefined;
let currentBaseUrl: string | undefined;
let readyListener: (() => void) | undefined;

function normalizeBaseUrl(url: string): string {
  let u = url.trim();
  if (!/^https?:\/\//.test(u)) u = `https://${u}`;
  while (u.endsWith("/")) u = u.slice(0, -1);
  return u;
}

export interface ChatwootLoadOptions extends LoadOptions {
  websiteToken: string;
  baseUrl?: string;
  settings?: Record<string, unknown>;
}

export async function load(options: ChatwootLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (options.consent === false) return;
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? "https://app.chatwoot.com");
  const h = hashConfig({ websiteToken: options.websiteToken, baseUrl });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
  currentToken = options.websiteToken;
  currentBaseUrl = baseUrl;
  await waitForDefer(options.defer ?? "immediate");
  if (options.settings) w().chatwootSettings = options.settings;

  readyListener = () => {
    const api = w().$chatwoot;
    if (api) queue.ready(api);
  };
  window?.addEventListener("chatwoot:ready", readyListener, { once: true });

  try {
    await injectScript({
      id: "ahize-chatwoot",
      src: `${baseUrl}/packs/js/sdk.js`,
      defer: true,
      async: false,
      nonce: options.nonce,
    });
  } catch (error) {
    lifecycle.transition("idle");
    lifecycle.clearConfigHash();
    throw error;
  }

  w().chatwootSDK?.run({ websiteToken: options.websiteToken, baseUrl });
  lifecycle.transition("ready");
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  if (!identity.id) return Promise.resolve();
  if (identity.verification && identity.verification.kind !== "hmac") {
    return Promise.reject(new Error("Chatwoot requires HMAC verification (kind: 'hmac')"));
  }
  store.identify(identity);
  const id = identity.id;
  return queue.enqueue((api) => {
    const user: Record<string, unknown> = {};
    if (identity.email) user["email"] = identity.email;
    if (identity.name) user["name"] = identity.name;
    if (identity.phone) user["phone_number"] = identity.phone;
    if (identity.verification?.kind === "hmac") {
      user["identifier_hash"] = identity.verification.hash;
    }
    if (identity.attributes) Object.assign(user, identity.attributes);
    api.setUser(id, user);
  });
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => {
    api.setCustomAttributes({ [event]: metadata ?? true });
  });
}

export function setLabel(label: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => api.setLabel(label));
}

export function removeLabel(label: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => api.removeLabel?.(label));
}

export function setLocale(locale: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => api.setLocale?.(locale));
}

export function setBubbleVisibility(state: "show" | "hide"): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => api.toggleBubbleVisibility?.(state));
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => {
    api.toggle("open");
  });
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => {
    api.toggle("close");
  });
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue
    .enqueue((api) => {
      if (api.isOpen) {
        console.warn(
          "[ahize/chatwoot] shutdown() called while widget is open; closing before reset to avoid state corruption.",
        );
        api.toggle("close");
      }
      api.reset();
    })
    .then(() => {
      store.reset();
      lifecycle.transition("shutdown");
    });
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  removeScript("ahize-chatwoot");
  if (readyListener && window) {
    window.removeEventListener?.("chatwoot:ready", readyListener);
    readyListener = undefined;
  }
  const g = w();
  Reflect.deleteProperty(g, "chatwootSDK");
  Reflect.deleteProperty(g, "$chatwoot");
  Reflect.deleteProperty(g, "chatwootSettings");
  queue.reset();
  store.reset();
  currentToken = undefined;
  currentBaseUrl = undefined;
  lifecycle.clearConfigHash();
  lifecycle.transition("idle");
}

export function getConfig(): { websiteToken?: string; baseUrl?: string } {
  return { websiteToken: currentToken, baseUrl: currentBaseUrl };
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
