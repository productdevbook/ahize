import { createIdentityStore } from "../_identity.ts";
import { injectScript, isBrowser } from "../_loader.ts";
import type { Identity, IdentityListener, IdentityState, LoadOptions } from "../_types.ts";

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

export interface CrispLoadOptions extends LoadOptions {
  websiteId: string;
  tokenId?: string;
  locale?: string;
}

export async function load(options: CrispLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  bus();
  w().CRISP_WEBSITE_ID = options.websiteId;
  if (options.tokenId) w().CRISP_TOKEN_ID = options.tokenId;
  if (options.locale) {
    w().CRISP_RUNTIME_CONFIG = { ...w().CRISP_RUNTIME_CONFIG, locale: options.locale };
  }
  await injectScript({ id: "ahize-crisp", src: "https://client.crisp.chat/l.js" });
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
  return Promise.resolve();
}

export function track(event: string, metadata?: Record<string, unknown>): Promise<void> {
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
  return Promise.resolve();
}

export function getIdentity(): IdentityState {
  return store.get();
}

export function onIdentityChange(listener: IdentityListener): () => void {
  return store.onChange(listener);
}
