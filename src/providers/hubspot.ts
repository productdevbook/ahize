import { createIdentityStore } from "../_identity.ts";
import { injectScript, isBrowser } from "../_loader.ts";
import { createQueue } from "../_queue.ts";
import type { Identity, IdentityListener, IdentityState, LoadOptions } from "../_types.ts";

interface HubSpotConversations {
  widget: {
    load(options?: { widgetOpen?: boolean }): void;
    open(): void;
    close(): void;
    remove(): void;
    refresh(options?: { openToNewThread?: boolean }): void;
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

function hsq(): unknown[] {
  const g = w();
  if (!g._hsq) g._hsq = [];
  return g._hsq;
}

const conversations = createQueue<HubSpotConversations>();
const store = createIdentityStore();

export interface HubSpotLoadOptions extends LoadOptions {
  portalId: string;
}

export async function load(options: HubSpotLoadOptions): Promise<void> {
  if (!isBrowser()) return;
  if (conversations.isReady()) return;

  w().hsConversationsSettings = { loadImmediately: false };

  if (!w().hsConversationsOnReady) w().hsConversationsOnReady = [];
  w().hsConversationsOnReady!.push(() => {
    const api = w().HubSpotConversations;
    if (api) conversations.ready(api);
  });

  await injectScript({
    id: "ahize-hubspot",
    src: `//js.hs-scripts.com/${options.portalId}.js`,
  });
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  if (identity.verification && identity.verification.kind !== "jwt") {
    return Promise.reject(new Error("HubSpot requires JWT verification (kind: 'jwt')"));
  }
  store.identify(identity);
  hsq().push(["identify", { email: identity.email, id: identity.id }]);
  if (identity.verification?.kind === "jwt") {
    const settings = w().hsConversationsSettings ?? {};
    w().hsConversationsSettings = {
      ...settings,
      identificationEmail: identity.email,
      identificationToken: identity.verification.token,
    };
  }
  return Promise.resolve();
}

export function track(event: string, metadata?: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  hsq().push(["trackEvent", { id: event, value: metadata }]);
  return Promise.resolve();
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return conversations.enqueue((api) => {
    api.widget.load({ widgetOpen: true });
    api.widget.open();
  });
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return conversations.enqueue((api) => {
    api.widget.close();
  });
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return conversations.enqueue((api) => {
    api.widget.remove();
    api.clear({ resetWidget: true });
    store.reset();
  });
}

export function getIdentity(): IdentityState {
  return store.get();
}

export function onIdentityChange(listener: IdentityListener): () => void {
  return store.onChange(listener);
}
