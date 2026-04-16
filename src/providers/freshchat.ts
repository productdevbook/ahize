/**
 * Freshchat (Freshworks) web messenger — v1 SDK with US/EU/IN/AU regions — wrapped under the unified `ahize` provider surface.
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

interface FreshchatUser {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  externalId?: string
}

interface FreshchatWidget {
  init(opts: Record<string, unknown>): void
  user: {
    setProperties(props: Record<string, unknown>): void
    update(user: FreshchatUser): void
    clear(): void
    setEmail(email: string): void
    setFirstName(name: string): void
    setLastName(name: string): void
    setPhone(phone: string): void
    setLocale?(locale: string): void
  }
  setExternalId(id: string): void
  setJWTAuthToken(token: string): void
  setConfig?(config: Record<string, unknown>): void
  setTags?(tags: string[]): void
  setFaqTags?(payload: { tags: string[]; filterType?: string }): void
  trackPage?(url: string, title?: string): void
  isOpen?(): boolean
  isLoaded?(): boolean
  conversation?: {
    setBotVariables?(vars: Record<string, unknown>): void
    setConversationProperties?(props: Record<string, unknown>): void
  }
  track?: (event: string, props?: Record<string, unknown>) => void
  show(): void
  hide(): void
  open(opts?: { name?: string }): void
  close(): void
  destroy(): void
  on(event: string, cb: (payload: unknown) => void): void
  off(event: string, cb: (payload: unknown) => void): void
  isInitialized(): boolean
}

interface FreshchatWindow {
  fcWidget?: FreshchatWidget
  fcSettings?: Record<string, unknown>
}

function w(): FreshchatWindow {
  return globalThis as unknown as FreshchatWindow
}

const queue = createQueue<FreshchatWidget>()
const store = createIdentityStore()
const lifecycle = createLifecycle()

/** Region keys this provider's vendor supports. */
export type FreshchatRegion = "us" | "eu" | "in" | "au"
const REGION_HOSTS: Record<FreshchatRegion, string> = {
  us: "https://wchat.freshchat.com",
  eu: "https://wchat.eu.freshchat.com",
  in: "https://wchat.in.freshchat.com",
  au: "https://wchat.au.freshchat.com",
}

/** Typed lifecycle/event names accepted by this provider's `on()`. */
export type FreshchatEventName =
  | "widgetLoaded"
  | "widgetOpened"
  | "widgetClosed"
  | "widgetDestroyed"
  | "userCreated"
  | "userCleared"
  | "userStateChange"
  | "messageSent"
  | "messageReceived"
  | "unreadCountNotify"
  | "dialogOpened"
  | "dialogClosed"
  | "csatReceived"
  | "csatUpdated"
  | "conversationResolved"
  | "frameStateChange"

const FRESHCHAT_EVENT_MAP: Record<string, FreshchatEventName> = {
  "widget:loaded": "widgetLoaded",
  "widget:opened": "widgetOpened",
  "widget:closed": "widgetClosed",
  "widget:destroyed": "widgetDestroyed",
  "user:created": "userCreated",
  "user:cleared": "userCleared",
  "user:statechange": "userStateChange",
  "message:sent": "messageSent",
  "message:received": "messageReceived",
  "unreadCount:notify": "unreadCountNotify",
  "dialog:opened": "dialogOpened",
  "dialog:closed": "dialogClosed",
  "csat:received": "csatReceived",
  "csat:updated": "csatUpdated",
  "conversation:resolved": "conversationResolved",
  "frame:statechange": "frameStateChange",
}

const eventListeners = new Map<FreshchatEventName, Set<(payload?: unknown) => void>>()
const unreadListeners = new Set<(count: number) => void>()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined
let currentToken: string | undefined
let currentHost: string | undefined

/** Load-time options for this provider's `load()` call. */
export interface FreshchatLoadOptions extends LoadOptions {
  token: string
  /** Convenience for picking the regional host. */
  region?: FreshchatRegion
  /** Explicit host (overrides region). e.g. https://wchat.freshchat.com */
  host?: string
  externalId?: string
  restoreId?: string
  /** Multi-site separation under one Freshchat account. */
  siteId?: string
  /** Initial UI locale (e.g. "tr-TR"). */
  locale?: string
  /** Bot/topic tags applied at init. */
  tags?: string[]
  /** FAQ topic filter at init. */
  faqTags?: { tags: string[]; filterType?: string }
  /** Open a parallel conversation on the same topic. */
  conversationReferenceId?: string
  /** Open the widget panel on load. */
  open?: boolean
  /** Eagerly load the widget chrome before user interaction. */
  eagerLoad?: boolean
}

/** Inject the freshchat CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: FreshchatLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const host = options.host ?? (options.region ? REGION_HOSTS[options.region] : REGION_HOSTS.us)
  const h = hashConfig({ token: options.token, host })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  currentToken = options.token
  currentHost = host
  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  await waitForDefer(options.defer ?? "immediate")

  try {
    await injectScript({
      id: "ahize-freshchat",
      src: `${host}/js/widget.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const widget = w().fcWidget
    if (widget) {
      const initPayload: Record<string, unknown> = {
        token: options.token,
        host,
        externalId: options.externalId,
        restoreId: options.restoreId,
      }
      if (options.siteId !== undefined) initPayload["siteId"] = options.siteId
      if (options.locale !== undefined) initPayload["locale"] = options.locale
      if (options.tags !== undefined) initPayload["tags"] = options.tags
      if (options.faqTags !== undefined) initPayload["faqTags"] = options.faqTags
      if (options.conversationReferenceId !== undefined) {
        initPayload["conversationReferenceId"] = options.conversationReferenceId
      }
      if (options.open !== undefined) initPayload["open"] = options.open
      if (options.eagerLoad !== undefined) {
        initPayload["config"] = {
          ...(initPayload["config"] as object),
          eagerLoad: options.eagerLoad,
        }
      }
      widget.init(initPayload)
      queue.ready(widget)
      // Wire all documented widget events to the typed emitter.
      for (const [vendorName, mapped] of Object.entries(FRESHCHAT_EVENT_MAP)) {
        widget.on(vendorName, (payload: unknown) => {
          const set = eventListeners.get(mapped)
          if (set) for (const l of set) l(payload)
          if (mapped === "widgetLoaded") readyResolve?.()
          if (mapped === "unreadCountNotify") {
            const count =
              (payload as { count?: number } | undefined)?.count ??
              (typeof payload === "number" ? payload : 0)
            for (const l of unreadListeners) l(count)
          }
        })
      }
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  lifecycle.transition("ready")
}

/** Promise that resolves once freshchat's API is live. */
export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

/** Set the current visitor on freshchat. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (identity.verification && identity.verification.kind !== "jwt") {
    return Promise.reject(new Error("Freshchat requires JWT verification (kind: 'jwt')"))
  }
  store.identify(identity)
  return queue.enqueue((widget) => {
    if (identity.verification?.kind === "jwt") widget.setJWTAuthToken(identity.verification.token)
    if (identity.id) widget.setExternalId(identity.id)
    const [first, ...rest] = (identity.name ?? "").split(" ")
    widget.user.update({
      email: identity.email,
      phone: identity.phone,
      firstName: first || undefined,
      lastName: rest.join(" ") || undefined,
      externalId: identity.id,
    })
    if (identity.attributes) widget.user.setProperties(identity.attributes)
  })
}

/** Emit a custom event to freshchat. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.track?.(event, metadata))
}

/** Notify freshchat of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => {
    if (info?.path && widget.trackPage) widget.trackPage(info.path)
    if (info?.locale) widget.user.setLocale?.(info.locale)
  })
}

/** Show / open the freshchat widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.show())
}

/** Hide / close the freshchat widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.hide())
}

/** Open / expand the chat panel. */
export function open(opts?: { name?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.open(opts))
}

/** Close / collapse the chat panel. */
export function close(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.close())
}

/** Switch the widget's locale at runtime. */
export function setLocale(locale: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.user.setLocale?.(locale))
}

/** Set the conversation tags. */
export function setTags(tags: string[]): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.setTags?.(tags))
}

/** Filter the FAQ list by tags. */
export function setFaqTags(payload: { tags: string[]; filterType?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.setFaqTags?.(payload))
}

/** Apply runtime config overrides. */
export function setConfig(config: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.setConfig?.(config))
}

/** Provide variables to the conversation bot. */
export function setBotVariables(vars: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.conversation?.setBotVariables?.(vars))
}

/** Set custom conversation properties. */
export function setConversationProperties(props: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.conversation?.setConversationProperties?.(props))
}

/** Send a page-view to the vendor with explicit url and title. */
export function trackPage(url: string, title?: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.trackPage?.(url, title))
}

/** Synchronous getter — `true` when the widget panel is open. */
export function isOpen(): boolean | undefined {
  if (!isBrowser()) return undefined
  return w().fcWidget?.isOpen?.()
}

/** Synchronous getter — `true` once the widget chrome has loaded. */
export function isLoaded(): boolean | undefined {
  if (!isBrowser()) return undefined
  return w().fcWidget?.isLoaded?.()
}

/** Subscribe to the provider's typed lifecycle/event stream. Returns
 *  an unsubscribe function. */
export function on(event: FreshchatEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

/** Subscribe to freshchat's unread-count updates. Returns an unsubscribe
 *  function. */
export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

/** End the freshchat session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((widget) => {
      widget.user.clear()
      widget.destroy()
    })
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

/** Hard reset: remove the injected script, clear globals & listeners,
 *  return to the idle lifecycle state. */
export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-freshchat")
  const g = w()
  Reflect.deleteProperty(g, "fcWidget")
  Reflect.deleteProperty(g, "fcSettings")
  queue.reset()
  store.reset()
  eventListeners.clear()
  unreadListeners.clear()
  currentToken = undefined
  currentHost = undefined
  readyPromise = undefined
  readyResolve = undefined
  lifecycle.clearConfigHash()
  lifecycle.transition("idle")
}

/** Read the wrapper's currently-resolved configuration. */
export function getConfig(): { token?: string; host?: string } {
  return { token: currentToken, host: currentHost }
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
