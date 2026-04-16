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
const lifecycle = createLifecycle();
let currentAppId: string | undefined;

export interface IntercomLoadOptions extends LoadOptions {
  appId: string;
}

export async function load(options: IntercomLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (options.consent === false) return;
  const configHash = hashConfig({ appId: options.appId });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === configHash) return;
  if (lifecycle.state() === "loading") return;
  if (lifecycle.configHash() && lifecycle.configHash() !== configHash) {
    await destroy();
  }

  lifecycle.transition("loading");
  currentAppId = options.appId;
  lifecycle.setConfigHash(configHash);
  await waitForDefer(options.defer ?? "immediate");
  w().intercomSettings = { app_id: options.appId };
  const stub = ensureStub();
  stub("boot", { app_id: options.appId });

  try {
    await injectScript({
      id: "ahize-intercom",
      src: `https://widget.intercom.io/widget/${options.appId}`,
      nonce: options.nonce,
    });
  } catch (error) {
    lifecycle.transition("idle");
    lifecycle.clearConfigHash();
    throw error;
  }

  const fn = w().Intercom;
  if (typeof fn === "function") queue.ready(fn);
  lifecycle.transition("ready");
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
      ...identity.attributes,
    });
  });
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
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
  const prev = lifecycle.state();
  return queue
    .enqueue((Intercom) => {
      Intercom("shutdown");
    })
    .then(() => {
      store.reset();
      queue.reset();
      lifecycle.transition("shutdown");
      if (currentAppId && prev === "ready") {
        const fn = w().Intercom;
        if (typeof fn === "function") fn("boot", { app_id: currentAppId });
      }
    });
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  removeScript("ahize-intercom");
  const g = w();
  Reflect.deleteProperty(g, "Intercom");
  Reflect.deleteProperty(g, "intercomSettings");
  currentAppId = undefined;
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
