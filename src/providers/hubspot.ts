import { injectScript, isBrowser } from "../_loader.ts";
import type { LoadOptions, Visitor } from "../_types.ts";

interface HubSpotConversations {
  widget: {
    load(options?: { widgetOpen?: boolean }): void;
    open(): void;
    close(): void;
    remove(): void;
  };
  clear(options?: { resetWidget?: boolean }): void;
}

interface HubSpotWindow {
  HubSpotConversations?: HubSpotConversations;
  hsConversationsSettings?: Record<string, unknown>;
  hsConversationsOnReady?: Array<() => void>;
  _hsq?: unknown[];
}

function w(): HubSpotWindow {
  return globalThis as unknown as HubSpotWindow;
}

export interface HubSpotLoadOptions extends LoadOptions {
  portalId: string;
}

export async function load(options: HubSpotLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  await injectScript({
    id: "ahize-hubspot",
    src: `//js.hs-scripts.com/${options.portalId}.js`,
  });
}

export function identify(visitor: Visitor): void {
  const g = w();
  if (!g._hsq) g._hsq = [];
  g._hsq.push(["identify", { email: visitor.email, id: visitor.id }]);
}

export function track(event: string, metadata?: Record<string, unknown>): void {
  const g = w();
  if (!g._hsq) g._hsq = [];
  g._hsq.push(["trackEvent", { id: event, value: metadata }]);
}

export function show(): void {
  w().HubSpotConversations?.widget.open();
}

export function hide(): void {
  w().HubSpotConversations?.widget.close();
}

export function shutdown(): void {
  w().HubSpotConversations?.widget.remove();
}
