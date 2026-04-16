import { injectScript, isBrowser } from "../_loader.ts";
import type { LoadOptions, Visitor } from "../_types.ts";

interface IntercomWindow {
  Intercom?: (command: string, ...args: unknown[]) => void;
  intercomSettings?: Record<string, unknown>;
}

function w(): IntercomWindow {
  return (globalThis as unknown as IntercomWindow) ?? {};
}

export interface IntercomLoadOptions extends LoadOptions {
  appId: string;
}

export async function load(options: IntercomLoadOptions): Promise<void> {
  if (!isBrowser()) return;

  w().intercomSettings = { app_id: options.appId };

  await injectScript({
    id: "ahize-intercom",
    src: `https://widget.intercom.io/widget/${options.appId}`,
  });
}

export function identify(visitor: Visitor): void {
  w().Intercom?.("update", {
    user_id: visitor.id,
    email: visitor.email,
    name: visitor.name,
    phone: visitor.phone,
    created_at: visitor.createdAt,
  });
}

export function track(event: string, metadata?: Record<string, unknown>): void {
  w().Intercom?.("trackEvent", event, metadata);
}

export function show(): void {
  w().Intercom?.("show");
}

export function hide(): void {
  w().Intercom?.("hide");
}

export function shutdown(): void {
  w().Intercom?.("shutdown");
}
