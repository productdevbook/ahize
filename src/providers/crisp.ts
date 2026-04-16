import { createIdentityStore } from "../_identity.ts";
import { createLifecycle, hashConfig } from "../_lifecycle.ts";
import { injectScript, isBrowser, removeScript } from "../_loader.ts";
import type {
  EventMetadata,
  Identity,
  IdentityListener,
  IdentityState,
  LoadOptions,
} from "../_types.ts";

type CrispCmd = unknown[];

interface CrispArray extends Array<CrispCmd> {
  push(cmd: CrispCmd): number;
}

interface CrispWindow {
  $crisp?: CrispArray;
  CRISP_WEBSITE_ID?: string;
  CRISP_TOKEN_ID?: string;
  CRISP_RUNTIME_CONFIG?: Record<string, unknown>;
}

function w(): CrispWindow {
  return globalThis as unknown as CrispWindow;
}

function bus(): CrispArray {
  const g = w();
  if (!g.$crisp) g.$crisp = [] as unknown as CrispArray;
  return g.$crisp;
}

const store = createIdentityStore();
const lifecycle = createLifecycle();

export interface CrispLoadOptions extends LoadOptions {
  websiteId: string;
  tokenId?: string;
  locale?: string;
}

export async function load(options: CrispLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  const h = hashConfig({ websiteId: options.websiteId, tokenId: options.tokenId });
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return;
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy();

  lifecycle.transition("loading");
  lifecycle.setConfigHash(h);
  bus();
  w().CRISP_WEBSITE_ID = options.websiteId;
  if (options.tokenId) w().CRISP_TOKEN_ID = options.tokenId;
  if (options.locale) {
    w().CRISP_RUNTIME_CONFIG = { ...w().CRISP_RUNTIME_CONFIG, locale: options.locale };
  }
  try {
    await injectScript({
      id: "ahize-crisp",
      src: "https://client.crisp.chat/l.js",
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
  if (identity.verification && identity.verification.kind !== "hmac") {
    return Promise.reject(new Error("Crisp requires HMAC verification (kind: 'hmac')"));
  }
  store.identify(identity);
  const q = bus();
  if (identity.email) {
    const args: unknown[] = [identity.email];
    if (identity.verification?.kind === "hmac") args.push(identity.verification.hash);
    q.push(["set", "user:email", args]);
  }
  if (identity.name) q.push(["set", "user:nickname", [identity.name]]);
  if (identity.phone) q.push(["set", "user:phone", [identity.phone]]);
  if (identity.attributes) {
    const pairs: unknown[][] = [];
    for (const [k, v] of Object.entries(identity.attributes)) pairs.push([k, v]);
    if (pairs.length > 0) q.push(["set", "session:data", [pairs]]);
  }
  return Promise.resolve();
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  bus().push(["set", "session:event", [[[event, metadata]]]]);
  return Promise.resolve();
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  bus().push(["do", "chat:show"]);
  bus().push(["do", "chat:open"]);
  return Promise.resolve();
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  bus().push(["do", "chat:hide"]);
  return Promise.resolve();
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  bus().push(["do", "session:reset"]);
  store.reset();
  lifecycle.transition("shutdown");
  return Promise.resolve();
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return;
  await shutdown().catch(() => undefined);
  removeScript("ahize-crisp");
  const g = w();
  Reflect.deleteProperty(g, "$crisp");
  Reflect.deleteProperty(g, "CRISP_WEBSITE_ID");
  Reflect.deleteProperty(g, "CRISP_TOKEN_ID");
  Reflect.deleteProperty(g, "CRISP_RUNTIME_CONFIG");
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
