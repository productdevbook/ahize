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

type ZendeskFn = (api: string, command: string, ...args: unknown[]) => void;

interface ZendeskWindow {
  zE?: ZendeskFn;
  zESettings?: Record<string, unknown>;
}

function w(): ZendeskWindow {
  return globalThis as unknown as ZendeskWindow;
}

const queue = createQueue<ZendeskFn>();
const store = createIdentityStore();
const lifecycle = createLifecycle();
const unreadListeners = new Set<(count: number) => void>();
let readyPromise: Promise<void> | undefined;
let readyResolve: (() => void) | undefined;

const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateKey(key: string): void {
  if (!UUID_KEY.test(key)) {
    console.warn(
      "[ahize/zendesk] key does not look like a Messenger UUID. " +
        "Use the snippet key (Messenger) — not the account/subdomain. " +
        "If you're integrating Web Widget (Classic) instead, file an issue.",
    );
  }
}

export interface ZendeskLoadOptions extends LoadOptions {
  key: string;
}

export async function load(options: ZendeskLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (options.consent === false) return;
  const h = hashConfig({ key: options.key });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
  validateKey(options.key);
  readyPromise = new Promise((r) => {
    readyResolve = r;
  });
  await waitForDefer(options.defer ?? "immediate");

  try {
    await injectScript({
      id: "ze-snippet",
      src: `https://static.zdassets.com/ekr/snippet.js?key=${options.key}`,
      nonce: options.nonce,
      partytown: options.partytown,
    });
  } catch (error) {
    lifecycle.transition("idle");
    lifecycle.clearConfigHash();
    throw error;
  }

  const fn = w().zE;
  if (typeof fn === "function") {
    queue.ready(fn);
    fn("messenger:on", "unreadMessages", (count: number) => {
      for (const l of unreadListeners) l(count);
    });
  }
  lifecycle.transition("ready");
  readyResolve?.();
}

export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve();
}

export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener);
  return () => unreadListeners.delete(listener);
}

const loginErrorListeners = new Set<(err: unknown) => void>();

export function onLoginError(listener: (err: unknown) => void): () => void {
  loginErrorListeners.add(listener);
  return () => loginErrorListeners.delete(listener);
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  if (!identity.verification) {
    return Promise.reject(
      new Error("Zendesk Messenger requires verification (kind: 'jwt' or 'callback')"),
    );
  }
  if (identity.verification.kind !== "jwt" && identity.verification.kind !== "callback") {
    return Promise.reject(
      new Error("Zendesk Messenger requires verification (kind: 'jwt' or 'callback')"),
    );
  }
  store.identify(identity);
  const verification = identity.verification;
  return queue.enqueue((zE) => {
    zE(
      "messenger",
      "loginUser",
      (callback: unknown) => {
        const deliver = callback as (jwt: string) => void;
        if (verification.kind === "jwt") {
          deliver(verification.token);
        } else {
          Promise.resolve(verification.getToken())
            .then(deliver)
            .catch((err) => {
              for (const l of loginErrorListeners) l(err);
            });
        }
      },
      (err: unknown) => {
        console.warn("[ahize/zendesk] loginUser failed", err);
        for (const l of loginErrorListeners) l(err);
      },
    );
  });
}

export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((zE) => {
    if (info?.locale) zE("messenger", "locale", info.locale);
    if (info?.path) zE("messenger:set", "conversationFields", [{ id: "path", value: info.path }]);
  });
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((zE) => {
    zE("messenger", "conversationFields", [{ id: event, value: metadata }]);
  });
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((zE) => {
    zE("messenger", "show");
    zE("messenger", "open");
  });
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((zE) => {
    zE("messenger", "hide");
  });
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue
    .enqueue((zE) => {
      zE("messenger", "logoutUser");
    })
    .then(() => {
      store.reset();
      lifecycle.transition("shutdown");
    });
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  removeScript("ze-snippet");
  const g = w();
  Reflect.deleteProperty(g, "zE");
  Reflect.deleteProperty(g, "zESettings");
  queue.reset();
  store.reset();
  unreadListeners.clear();
  loginErrorListeners.clear();
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
