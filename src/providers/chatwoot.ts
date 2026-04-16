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
const unreadListeners = new Set<(count: number) => void>();
type ChatwootEventName = "ready" | "message" | "unreadCountChange" | "error";
const eventListeners = new Map<ChatwootEventName, Set<(payload: unknown) => void>>();
let currentToken: string | undefined;
let currentBaseUrl: string | undefined;
let readyListener: (() => void) | undefined;
let readyPromise: Promise<void> | undefined;
let readyResolve: (() => void) | undefined;
const dispatchedDomEvents = new Map<ChatwootEventName, () => void>();

function fire(name: ChatwootEventName, payload: unknown): void {
  const set = eventListeners.get(name);
  if (!set) return;
  for (const l of set) l(payload);
  if (name === "unreadCountChange") {
    const count = (payload as { unreadMessageCount?: number } | undefined)?.unreadMessageCount ?? 0;
    for (const l of unreadListeners) l(count);
  }
}

function bindDomEvent(domName: string, mapped: ChatwootEventName): void {
  if (!isBrowser()) return;
  if (dispatchedDomEvents.has(mapped)) return;
  const handler = (event: Event) => {
    const detail = (event as Event & { detail?: unknown }).detail;
    fire(mapped, detail);
  };
  window?.addEventListener?.(domName, handler as () => void);
  dispatchedDomEvents.set(mapped, () =>
    window?.removeEventListener?.(domName, handler as () => void),
  );
}

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

  readyPromise = new Promise((r) => {
    readyResolve = r;
  });
  readyListener = () => {
    const api = w().$chatwoot;
    if (api) queue.ready(api);
    readyResolve?.();
    fire("ready", undefined);
  };
  window?.addEventListener("chatwoot:ready", readyListener, { once: true });

  // Wire up the rest of Chatwoot's CustomEvents to our typed emitter.
  bindDomEvent("chatwoot:on-message", "message");
  bindDomEvent("chatwoot:on-unread-message-count-changed", "unreadCountChange");
  bindDomEvent("chatwoot:error", "error");

  try {
    await injectScript({
      id: "ahize-chatwoot",
      src: `${baseUrl}/packs/js/sdk.js`,
      defer: true,
      async: false,
      nonce: options.nonce,
      partytown: options.partytown,
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

export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => {
    const attrs: Record<string, unknown> = {};
    if (info?.path) attrs["path"] = info.path;
    if (Object.keys(attrs).length > 0) api.setCustomAttributes(attrs);
    if (info?.locale) api.setLocale?.(info.locale);
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

export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve();
}

export function on(event: ChatwootEventName, listener: (payload: unknown) => void): () => void {
  let set = eventListeners.get(event);
  if (!set) {
    set = new Set();
    eventListeners.set(event, set);
  }
  set.add(listener);
  return () => set?.delete(listener);
}

export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener);
  return () => unreadListeners.delete(listener);
}

export function setAttribute(args: {
  scope: "contact" | "conversation";
  key: string;
  value: unknown;
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => {
    const payload = { [args.key]: args.value };
    if (args.scope === "conversation" && api.setConversationCustomAttributes) {
      api.setConversationCustomAttributes(payload);
    } else {
      api.setCustomAttributes(payload);
    }
  });
}

export function setTheme(args: {
  mode?: "light" | "dark" | "auto";
  color?: string;
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((_api) => {
    const root = document.querySelectorAll(".woot-widget-holder");
    for (let i = 0; i < root.length; i++) {
      const el = root[i] as unknown as { style?: Record<string, string> };
      if (args.color && el.style) el.style["color-scheme"] = args.mode ?? "auto";
    }
    // setWidgetColor may not exist on older Chatwoot versions; ignore.
  });
}

export async function safeShutdown(timeoutMs = 2000): Promise<void> {
  if (!isBrowser()) return;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const api = w().$chatwoot;
    if (!api || !api.isOpen) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await shutdown();
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
  for (const off of dispatchedDomEvents.values()) off();
  dispatchedDomEvents.clear();
  eventListeners.clear();
  unreadListeners.clear();
  const g = w();
  Reflect.deleteProperty(g, "chatwootSDK");
  Reflect.deleteProperty(g, "$chatwoot");
  Reflect.deleteProperty(g, "chatwootSettings");
  queue.reset();
  store.reset();
  currentToken = undefined;
  currentBaseUrl = undefined;
  readyPromise = undefined;
  readyResolve = undefined;
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
