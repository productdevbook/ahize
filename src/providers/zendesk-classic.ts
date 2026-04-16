// Zendesk Web Widget (Classic) — predates Messenger. Different snippet, different
// API surface (zE('webWidget', '...')). Kept separate from ahize/zendesk so
// types don't pretend cross-compatibility.

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

export interface ZendeskClassicLoadOptions extends LoadOptions {
  key: string;
}

export async function load(options: ZendeskClassicLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (options.consent === false) return;
  const h = hashConfig({ key: options.key });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
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
  if (typeof fn === "function") queue.ready(fn);
  lifecycle.transition("ready");
}

export function ready(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue(() => {});
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  store.identify(identity);
  return queue.enqueue((zE) => {
    zE("webWidget", "prefill", {
      name: { value: identity.name, readOnly: false },
      email: { value: identity.email, readOnly: false },
      phone: { value: identity.phone, readOnly: false },
    });
  });
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((zE) => {
    zE("webWidget", "updatePath", { url: location.href, title: event });
    if (metadata) {
      zE("webWidget", "updateSettings", {
        webWidget: { contactForm: { tags: Object.keys(metadata) } },
      });
    }
  });
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((zE) => zE("webWidget", "updatePath"));
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((zE) => {
    zE("webWidget", "show");
    zE("webWidget", "open");
  });
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue.enqueue((zE) => zE("webWidget", "hide"));
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return queue
    .enqueue((zE) => zE("webWidget", "logout"))
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
