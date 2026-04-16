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

interface DriftAPI {
  identify(userId: string, attributes?: Record<string, unknown>): void;
  track(event: string, props?: Record<string, unknown>): void;
  show(): void;
  hide(): void;
  reset(): void;
  on(event: string, cb: (payload: unknown) => void): void;
  off(event: string, cb: (payload: unknown) => void): void;
  api?: { openChat(): void; setUserAttributes(attrs: Record<string, unknown>): void };
}

interface DriftWindow {
  drift?: DriftAPI;
  driftt?: DriftAPI;
}

function w(): DriftWindow {
  return globalThis as unknown as DriftWindow;
}

const queue = createQueue<DriftAPI>();
const store = createIdentityStore();
const lifecycle = createLifecycle();
let readyPromise: Promise<void> | undefined;
let readyResolve: (() => void) | undefined;

export interface DriftLoadOptions extends LoadOptions {
  embedId: string;
  version?: string;
}

export async function load(options: DriftLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (options.consent === false) return;
  const h = hashConfig({ embedId: options.embedId });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
  readyPromise = new Promise((r) => {
    readyResolve = r;
  });
  await waitForDefer(options.defer ?? "immediate");

  const version = options.version ?? "latest";
  try {
    await injectScript({
      id: "ahize-drift",
      src: `https://js.driftt.com/include/${version}/${options.embedId}.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    });
  } catch (error) {
    lifecycle.transition("idle");
    lifecycle.clearConfigHash();
    throw error;
  }

  for (let i = 0; i < 80; i++) {
    const drift = w().drift;
    if (drift) {
      queue.ready(drift);
      drift.on("ready", () => readyResolve?.());
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  lifecycle.transition("ready");
}

export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve();
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  if (!identity.id) return Promise.resolve();
  if (identity.verification && identity.verification.kind !== "jwt") {
    return Promise.reject(new Error("Drift requires JWT verification (kind: 'jwt')"));
  }
  store.identify(identity);
  return queue.enqueue((drift) => {
    const attrs: Record<string, unknown> = {
      email: identity.email,
      name: identity.name,
      phone: identity.phone,
      ...identity.attributes,
    };
    if (identity.verification?.kind === "jwt") attrs["userJwt"] = identity.verification.token;
    drift.identify(identity.id as string, attrs);
  });
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((drift) => drift.track(event, metadata));
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((drift) => drift.track("pageView"));
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((drift) => drift.show());
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((drift) => drift.hide());
}

export function openChat(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((drift) => drift.api?.openChat());
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue
    .enqueue((drift) => drift.reset())
    .then(() => {
      store.reset();
      lifecycle.transition("shutdown");
    });
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  removeScript("ahize-drift");
  const g = w();
  Reflect.deleteProperty(g, "drift");
  Reflect.deleteProperty(g, "driftt");
  queue.reset();
  store.reset();
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
