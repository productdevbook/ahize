import { injectScript, isBrowser } from "../_loader.ts";
import type { LoadOptions, Visitor } from "../_types.ts";

interface TawkAPI {
  visitor?: Record<string, unknown>;
  setAttributes?: (attrs: Record<string, unknown>, cb?: (err?: Error) => void) => void;
  addEvent?: (event: string, metadata?: Record<string, unknown>, cb?: (err?: Error) => void) => void;
  showWidget?: () => void;
  hideWidget?: () => void;
  endChat?: () => void;
}

interface TawkWindow {
  Tawk_API?: TawkAPI;
  Tawk_LoadStart?: Date;
}

function w(): TawkWindow {
  return globalThis as unknown as TawkWindow;
}

function api(): TawkAPI {
  const g = w();
  if (!g.Tawk_API) g.Tawk_API = {};
  return g.Tawk_API;
}

export interface TawkLoadOptions extends LoadOptions {
  propertyId: string;
  widgetId?: string;
}

export async function load(options: TawkLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  api();
  w().Tawk_LoadStart = new Date();
  const widget = options.widgetId ?? "default";
  await injectScript({
    id: "ahize-tawk",
    src: `https://embed.tawk.to/${options.propertyId}/${widget}`,
  });
}

export function identify(visitor: Visitor): void {
  const attrs: Record<string, unknown> = {};
  if (visitor.name) attrs["name"] = visitor.name;
  if (visitor.email) attrs["email"] = visitor.email;
  api().setAttributes?.(attrs);
}

export function track(event: string, metadata?: Record<string, unknown>): void {
  api().addEvent?.(event, metadata);
}

export function show(): void {
  api().showWidget?.();
}

export function hide(): void {
  api().hideWidget?.();
}

export function shutdown(): void {
  api().endChat?.();
}
