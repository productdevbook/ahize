import { createIdentityStore } from "../_identity.ts";
import { injectScript, isBrowser } from "../_loader.ts";
import { createQueue } from "../_queue.ts";
import type { Identity, IdentityListener, IdentityState, LoadOptions } from "../_types.ts";

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

export interface ZendeskLoadOptions extends LoadOptions {
  key: string;
}

export async function load(options: ZendeskLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (queue.isReady()) return;

  await injectScript({
    id: "ze-snippet",
    src: `https://static.zdassets.com/ekr/snippet.js?key=${options.key}`,
  });

  const fn = w().zE;
  if (typeof fn === "function") queue.ready(fn);
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
    zE("messenger", "loginUser", (callback: unknown) => {
      const deliver = callback as (jwt: string) => void;
      if (verification.kind === "jwt") {
        deliver(verification.token);
      } else {
        Promise.resolve(verification.getToken()).then(deliver);
      }
    });
  });
}

export function track(event: string, metadata?: Record<string, unknown>): Promise<void> {
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
  return queue.enqueue((zE) => {
    zE("messenger", "logoutUser");
    store.reset();
  });
}

export function getIdentity(): IdentityState {
  return store.get();
}

export function onIdentityChange(listener: IdentityListener): () => void {
  return store.onChange(listener);
}
