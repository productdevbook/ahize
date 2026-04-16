import { createIdentityStore } from "../_identity.ts";
import { injectScript, isBrowser } from "../_loader.ts";
import { createQueue } from "../_queue.ts";
import type { Identity, IdentityListener, IdentityState, LoadOptions } from "../_types.ts";

type IntercomFn = (command: string, ...args: unknown[]) => void;

interface IntercomWindow {
  Intercom?: IntercomFn;
  intercomSettings?: Record<string, unknown>;
}

function w(): IntercomWindow {
  return globalThis as unknown as IntercomWindow;
}

interface StubIntercom extends IntercomFn {
  q?: unknown[];
  c?: (args: unknown[]) => void;
}

function ensureStub(): StubIntercom {
  const g = w();
  const existing = g.Intercom as StubIntercom | undefined;
  if (existing) return existing;
  const stub = function (...args: unknown[]) {
    stub.c?.(args);
  } as StubIntercom;
  stub.q = [];
  stub.c = (args) => stub.q?.push(args);
  g.Intercom = stub;
  return stub;
}

const queue = createQueue<IntercomFn>();
const store = createIdentityStore();
let currentAppId: string | undefined;

export interface IntercomLoadOptions extends LoadOptions {
  appId: string;
}

export async function load(options: IntercomLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (queue.isReady()) return;

  currentAppId = options.appId;
  w().intercomSettings = { app_id: options.appId };
  const stub = ensureStub();
  stub("boot", { app_id: options.appId });

  await injectScript({
    id: "ahize-intercom",
    src: `https://widget.intercom.io/widget/${options.appId}`,
  });

  const fn = w().Intercom;
  if (typeof fn === "function") queue.ready(fn);
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  if (identity.verification && identity.verification.kind !== "hmac") {
    return Promise.reject(new Error("Intercom requires HMAC verification (kind: 'hmac')"));
  }
  store.identify(identity);
  return queue.enqueue((Intercom) => {
    Intercom("update", {
      app_id: currentAppId,
      user_id: identity.id,
      email: identity.email,
      name: identity.name,
      phone: identity.phone,
      created_at: identity.createdAt,
      user_hash: identity.verification?.kind === "hmac" ? identity.verification.hash : undefined,
    });
  });
}

export function track(event: string, metadata?: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((Intercom) => {
    Intercom("trackEvent", event, metadata);
  });
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((Intercom) => {
    Intercom("show");
  });
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((Intercom) => {
    Intercom("hide");
  });
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((Intercom) => {
    Intercom("shutdown");
    store.reset();
    queue.reset();
    if (currentAppId) {
      const fn = w().Intercom;
      if (typeof fn === "function") fn("boot", { app_id: currentAppId });
    }
  });
}

export function getIdentity(): IdentityState {
  return store.get();
}

export function onIdentityChange(listener: IdentityListener): () => void {
  return store.onChange(listener);
}
