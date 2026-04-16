/**
 * HubSpot Conversations chat widget — NA1/EU1/AP1 regions — wrapped under the unified `ahize` provider surface.
 *
 * Exports the standard surface (load, identify, track, pageView, show,
 * hide, shutdown, destroy, ready, isReady, state, getIdentity,
 * onIdentityChange) plus provider-specific extras — see README
 * "Providers" table.
 *
 * @module
 */
import { waitForDefer } from "../_defer.ts"
import { createIdentityStore } from "../_identity.ts"
import { createLifecycle, hashConfig } from "../_lifecycle.ts"
import { injectScript, isBrowser, removeScript } from "../_loader.ts"
import { createQueue } from "../_queue.ts"
import type {
  EventMetadata,
  Identity,
  IdentityListener,
  IdentityState,
  LoadOptions,
} from "../_types.ts"

interface HubSpotConversations {
  widget: {
    load(options?: { widgetOpen?: boolean }): void
    open(): void
    close(): void
    remove(): void
    refresh(options?: { openToNewThread?: boolean }): void
    status?(): { loaded: boolean; pending: boolean }
  }
  clear(options?: { resetWidget?: boolean }): void
  on(event: string, listener: (payload: unknown) => void): void
  off(event: string, listener: (payload: unknown) => void): void
}

interface HubSpotWindow {
  HubSpotConversations?: HubSpotConversations
  hsConversationsSettings?: Record<string, unknown>
  hsConversationsOnReady?: Array<() => void>
  _hsq?: unknown[]
}

function w(): HubSpotWindow {
  return globalThis as unknown as HubSpotWindow
}

function hsq(): unknown[] {
  const g = w()
  if (!g._hsq) g._hsq = []
  return g._hsq
}

const conversations = createQueue<HubSpotConversations>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
const unreadListeners = new Set<(count: number) => void>()
type HubSpotEventName =
  | "conversationStarted"
  | "conversationClosed"
  | "userSelectedThread"
  | "contactAssociated"
  | "userInteractedWithWidget"
  | "widgetLoaded"
  | "widgetClosed"
  | "quickReplyButtonClick"
const eventListeners = new Map<HubSpotEventName, Set<(payload: unknown) => void>>()
const HUBSPOT_EVENTS: readonly HubSpotEventName[] = [
  "conversationStarted",
  "conversationClosed",
  "userSelectedThread",
  "contactAssociated",
  "userInteractedWithWidget",
  "widgetLoaded",
  "widgetClosed",
  "quickReplyButtonClick",
]
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined

const TYPED_SETTINGS_KEYS = [
  "inlineEmbedSelector",
  "enableWidgetCookieBanner",
  "disableAttachment",
  "disableInitialInputFocus",
  "avoidInlineStyles",
  "hideNewThreadLink",
  "loadImmediately",
] as const

/** Region keys this provider's vendor supports. */
export type HubSpotRegion = "na1" | "eu1" | "ap1"
/** Cookie consent / banner mode accepted by this provider. */
export type HubSpotCookieBanner = boolean | "ON_WIDGET_LOAD" | "ON_EXIT_INTENT"

/** Load-time options for this provider's `load()` call. */
export interface HubSpotLoadOptions extends LoadOptions {
  portalId: string
  region?: HubSpotRegion
  /** Inline-embedded chat: CSS selector for the host element. */
  inlineEmbedSelector?: string
  /** GDPR cookie banner mode. */
  enableWidgetCookieBanner?: HubSpotCookieBanner
  /** Disable attachment uploads. */
  disableAttachment?: boolean
  /** Disable focusing the composer on widget open. */
  disableInitialInputFocus?: boolean
  /** Avoid inline styles (helps strict CSP setups). */
  avoidInlineStyles?: boolean
  /** Hide the "Start a new conversation" link. */
  hideNewThreadLink?: boolean
  /** When true, HubSpot auto-loads the widget on script ready (default: true). Wrapper sets false unless overridden. */
  loadImmediately?: boolean
}

function lowercaseKeys<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k !== k.toLowerCase()) {
      console.warn(
        `[ahize/hubspot] field '${k}' is not lowercase; HubSpot drops it. Renamed to '${k.toLowerCase()}'.`,
      )
    }
    out[k.toLowerCase()] = v
  }
  return out
}

function validateTrackKeys(metadata: Record<string, unknown> | undefined): void {
  if (!metadata) return
  for (const k of Object.keys(metadata)) {
    if (k !== k.toLowerCase() || /[^a-z0-9_]/.test(k)) {
      console.warn(
        `[ahize/hubspot] track() metadata key '${k}' must be lowercase + snake_case; HubSpot will drop it silently.`,
      )
    }
  }
}

/** Inject the hubspot CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: HubSpotLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ portalId: options.portalId, region: options.region })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  await waitForDefer(options.defer ?? "immediate")

  const settings: Record<string, unknown> = { loadImmediately: false }
  for (const key of TYPED_SETTINGS_KEYS) {
    const v = options[key]
    if (v !== undefined) settings[key] = v
  }
  w().hsConversationsSettings = settings

  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  if (!w().hsConversationsOnReady) w().hsConversationsOnReady = []
  w().hsConversationsOnReady!.push(() => {
    const api = w().HubSpotConversations
    if (api) {
      conversations.ready(api)
      api.on("unreadConversationCountChanged", (payload: unknown) => {
        const count = (payload as { unreadCount?: number } | undefined)?.unreadCount ?? 0
        for (const l of unreadListeners) l(count)
      })
      for (const evt of HUBSPOT_EVENTS) {
        api.on(evt, (payload: unknown) => {
          const set = eventListeners.get(evt)
          if (!set) return
          for (const l of set) l(payload)
        })
      }
      readyResolve?.()
    }
  })

  const host =
    options.region === "eu1"
      ? "js-eu1.hs-scripts.com"
      : options.region === "ap1"
        ? "js-ap1.hs-scripts.com"
        : "js.hs-scripts.com"
  try {
    await injectScript({
      id: "ahize-hubspot",
      src: `//${host}/${options.portalId}.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }
  lifecycle.transition("ready")
}

/** Set the current visitor on hubspot. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (identity.verification && identity.verification.kind !== "jwt") {
    return Promise.reject(
      new Error(
        "HubSpot requires an identification token (modeled as kind: 'jwt'); HubSpot's token is opaque, not a true JWT.",
      ),
    )
  }
  if (identity.email && !identity.verification) {
    console.warn(
      "[ahize/hubspot] identify() called with email but no identificationToken — HubSpot treats the session as anonymous until a token is provided.",
    )
  }
  store.identify(identity)
  const props = lowercaseKeys({
    email: identity.email,
    id: identity.id,
    ...identity.attributes,
  })
  hsq().push(["identify", props])
  if (identity.verification?.kind === "jwt") {
    const settings = w().hsConversationsSettings ?? {}
    w().hsConversationsSettings = {
      ...settings,
      identificationEmail: identity.email,
      identificationToken: identity.verification.token,
    }
  }
  return Promise.resolve()
}

/** Notify hubspot of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(info?: { path?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  const path = info?.path ?? (isBrowser() ? location.pathname + location.search : undefined)
  if (path) hsq().push(["setPath", path])
  hsq().push(["trackPageView"])
  return conversations.enqueue((api) => {
    api.widget.refresh({ openToNewThread: false })
  })
}

/** Emit a custom event to hubspot. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  validateTrackKeys(metadata)
  hsq().push(["trackEvent", { id: event, value: metadata }])
  return Promise.resolve()
}

/** Refresh the widget — useful after pageView() in HubSpot. */
export function refresh(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return conversations.enqueue((api) => {
    api.widget.refresh({ openToNewThread: false })
  })
}

/** Show / open the hubspot widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return conversations.enqueue((api) => {
    api.widget.load({ widgetOpen: true })
    api.widget.open()
  })
}

/** Hide / close the hubspot widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return conversations.enqueue((api) => {
    api.widget.close()
  })
}

/** End the hubspot session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return conversations
    .enqueue((api) => {
      api.widget.remove()
      api.clear({ resetWidget: true })
    })
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

/** Promise that resolves once hubspot's API is live. */
export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

/** Subscribe to hubspot's unread-count updates. Returns an unsubscribe
 *  function. */
export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

/** Subscribe to the provider's typed lifecycle/event stream. Returns
 *  an unsubscribe function. */
export function on(event: HubSpotEventName, listener: (payload: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

/** Synchronous status getter — `{ loaded, pending }`. */
export function status(): { loaded: boolean; pending: boolean } | undefined {
  if (!isBrowser()) return undefined
  return w().HubSpotConversations?.widget.status?.()
}

/** Hard reset: remove the injected script, clear globals & listeners,
 *  return to the idle lifecycle state. */
export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-hubspot")
  const g = w()
  Reflect.deleteProperty(g, "HubSpotConversations")
  Reflect.deleteProperty(g, "hsConversationsSettings")
  Reflect.deleteProperty(g, "hsConversationsOnReady")
  Reflect.deleteProperty(g, "_hsq")
  conversations.reset()
  store.reset()
  unreadListeners.clear()
  eventListeners.clear()
  readyPromise = undefined
  readyResolve = undefined
  lifecycle.clearConfigHash()
  lifecycle.transition("idle")
}

/** Read the current visitor identity snapshot. */
export function getIdentity(): IdentityState {
  return store.get()
}

/** Subscribe to identity transitions (anonymous ↔ identified). Returns an
 *  unsubscribe function. */
export function onIdentityChange(listener: IdentityListener): () => void {
  return store.onChange(listener)
}

/** Synchronous check — true once the widget is in the `ready` state. */
export function isReady(): boolean {
  return lifecycle.state() === "ready"
}

/** Current lifecycle state: `idle` | `loading` | `ready` | `shutdown`. */
export function state(): "idle" | "loading" | "ready" | "shutdown" {
  return lifecycle.state()
}
