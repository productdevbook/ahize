import { createIdentityStore } from "../_identity.ts";
import { injectScript, isBrowser } from "../_loader.ts";
import { createQueue } from "../_queue.ts";
import type { Identity, IdentityListener, IdentityState, LoadOptions } from "../_types.ts";

interface ChatwootSDK {
  run(options: { websiteToken: string; baseUrl: string }): void;
}

interface ChatwootAPI {
  setUser(identifier: string, user: Record<string, unknown>): void;
  setCustomAttributes(attrs: Record<string, unknown>): void;
  setLabel(label: string): void;
  toggle(state?: "open" | "close"): void;
  reset(): void;
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

export interface ChatwootLoadOptions extends LoadOptions {
  websiteToken: string;
  baseUrl?: string;
  settings?: Record<string, unknown>;
}

export async function load(options: ChatwootLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (queue.isReady()) return;

  const baseUrl = options.baseUrl ?? "https://app.chatwoot.com";
  if (options.settings) w().chatwootSettings = options.settings;

  const onReady = (): void => {
    const api = w().$chatwoot;
    if (api) queue.ready(api);
  };
  window.addEventListener("chatwoot:ready", onReady, { once: true });

  await injectScript({
    id: "ahize-chatwoot",
    src: `${baseUrl}/packs/js/sdk.js`,
    defer: true,
    async: false,
  });

  w().chatwootSDK?.run({ websiteToken: options.websiteToken, baseUrl });
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
    api.setUser(id, user);
  });
}

export function track(event: string, metadata?: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((api) => {
    api.setCustomAttributes({ [event]: metadata ?? true });
  });
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
  return queue.enqueue((api) => {
    api.reset();
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
