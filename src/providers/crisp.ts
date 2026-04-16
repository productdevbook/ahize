import { injectScript, isBrowser } from "../_loader.ts";
import type { LoadOptions, Visitor } from "../_types.ts";

interface CrispWindow {
  $crisp?: unknown[] & { push(cmd: unknown): void };
  CRISP_WEBSITE_ID?: string;
}

function w(): CrispWindow {
  return globalThis as unknown as CrispWindow;
}

function queue(): unknown[] & { push(cmd: unknown): void } {
  const g = w();
  if (!g.$crisp) g.$crisp = [] as unknown as typeof g.$crisp;
  return g.$crisp as unknown[] & { push(cmd: unknown): void };
}

export interface CrispLoadOptions extends LoadOptions {
  websiteId: string;
}

export async function load(options: CrispLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  queue();
  w().CRISP_WEBSITE_ID = options.websiteId;
  await injectScript({ id: "ahize-crisp", src: "https://client.crisp.chat/l.js" });
}

export function identify(visitor: Visitor): void {
  if (visitor.email) queue().push(["set", "user:email", [visitor.email]]);
  if (visitor.name) queue().push(["set", "user:nickname", [visitor.name]]);
  if (visitor.phone) queue().push(["set", "user:phone", [visitor.phone]]);
}

export function track(event: string, metadata?: Record<string, unknown>): void {
  queue().push(["set", "session:event", [[[event, metadata]]]]);
}

export function show(): void {
  queue().push(["do", "chat:show"]);
  queue().push(["do", "chat:open"]);
}

export function hide(): void {
  queue().push(["do", "chat:hide"]);
}

export function shutdown(): void {
  queue().push(["do", "session:reset"]);
}
