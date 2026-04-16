import { injectScript, isBrowser } from "../_loader.ts";
import type { LoadOptions, Visitor } from "../_types.ts";

type ZendeskFn = (api: string, command: string, ...args: unknown[]) => void;

interface ZendeskWindow {
  zE?: ZendeskFn;
  zESettings?: Record<string, unknown>;
}

function w(): ZendeskWindow {
  return globalThis as unknown as ZendeskWindow;
}

export interface ZendeskLoadOptions extends LoadOptions {
  key: string;
}

export async function load(options: ZendeskLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  await injectScript({
    id: "ze-snippet",
    src: `https://static.zdassets.com/ekr/snippet.js?key=${options.key}`,
  });
}

export function identify(visitor: Visitor): void {
  w().zE?.("messenger", "loginUser", (callback: unknown) => {
    (callback as (jwt: string) => void)?.(
      JSON.stringify({
        name: visitor.name,
        email: visitor.email,
        external_id: visitor.id,
      }),
    );
  });
}

export function track(event: string, metadata?: Record<string, unknown>): void {
  w().zE?.("messenger", "conversationFields", [{ id: event, value: metadata }]);
}

export function show(): void {
  w().zE?.("messenger", "show");
  w().zE?.("messenger", "open");
}

export function hide(): void {
  w().zE?.("messenger", "hide");
}

export function shutdown(): void {
  w().zE?.("messenger", "logoutUser");
}
