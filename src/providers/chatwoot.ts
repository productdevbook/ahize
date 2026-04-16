import { injectScript, isBrowser } from "../_loader.ts";
import type { LoadOptions, Visitor } from "../_types.ts";

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

export interface ChatwootLoadOptions extends LoadOptions {
  websiteToken: string;
  baseUrl?: string;
  settings?: Record<string, unknown>;
}

export async function load(options: ChatwootLoadOptions): Promise<void> {
  if (!isBrowser()) return;

  const baseUrl = options.baseUrl ?? "https://app.chatwoot.com";

  if (options.settings) w().chatwootSettings = options.settings;

  await injectScript({
    id: "ahize-chatwoot",
    src: `${baseUrl}/packs/js/sdk.js`,
    defer: true,
    async: false,
  });

  w().chatwootSDK?.run({ websiteToken: options.websiteToken, baseUrl });
}

export function identify(visitor: Visitor): void {
  if (!visitor.id) return;
  const user: Record<string, unknown> = {};
  if (visitor.email) user["email"] = visitor.email;
  if (visitor.name) user["name"] = visitor.name;
  if (visitor.phone) user["phone_number"] = visitor.phone;
  w().$chatwoot?.setUser(visitor.id, user);
}

export function track(event: string, metadata?: Record<string, unknown>): void {
  w().$chatwoot?.setCustomAttributes({ [event]: metadata ?? true });
}

export function show(): void {
  w().$chatwoot?.toggle("open");
}

export function hide(): void {
  w().$chatwoot?.toggle("close");
}

export function shutdown(): void {
  w().$chatwoot?.reset();
}
