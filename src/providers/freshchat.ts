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

export type FreshchatRegion = "us" | "eu" | "in" | "au"
const REGION_HOSTS: Record<FreshchatRegion, string> = {
  us: "https://wchat.freshchat.com",
  eu: "https://wchat.eu.freshchat.com",
  in: "https://wchat.in.freshchat.com",
  au: "https://wchat.au.freshchat.com",
}

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

export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

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

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.track?.(event, metadata))
}

export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => {
    if (info?.path && widget.trackPage) widget.trackPage(info.path)
    if (info?.locale) widget.user.setLocale?.(info.locale)
  })
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.show())
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.hide())
}

export function open(opts?: { name?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.open(opts))
}

export function close(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.close())
}

export function setLocale(locale: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.user.setLocale?.(locale))
}

export function setTags(tags: string[]): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.setTags?.(tags))
}

export function setFaqTags(payload: { tags: string[]; filterType?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.setFaqTags?.(payload))
}

export function setConfig(config: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.setConfig?.(config))
}

export function setBotVariables(vars: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.conversation?.setBotVariables?.(vars))
}

export function setConversationProperties(props: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.conversation?.setConversationProperties?.(props))
}

export function trackPage(url: string, title?: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.trackPage?.(url, title))
}

export function isOpen(): boolean | undefined {
  if (!isBrowser()) return undefined
  return w().fcWidget?.isOpen?.()
}

export function isLoaded(): boolean | undefined {
  if (!isBrowser()) return undefined
  return w().fcWidget?.isLoaded?.()
}

export function on(event: FreshchatEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

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

export function getConfig(): { token?: string; host?: string } {
  return { token: currentToken, host: currentHost }
}

export function getIdentity(): IdentityState {
  return store.get()
}

export function onIdentityChange(listener: IdentityListener): () => void {
  return store.onChange(listener)
}

export function isReady(): boolean {
  return lifecycle.state() === "ready"
}

export function state(): "idle" | "loading" | "ready" | "shutdown" {
  return lifecycle.state()
}
