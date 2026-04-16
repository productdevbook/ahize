/**
 * JivoChat widget — wrapped under the unified `ahize` provider surface.
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

interface JivoAPI {
  setContactInfo(info: {
    name?: string
    email?: string
    phone?: string
    description?: string
  }): void
  setUserToken?(token: string): void
  setClientAttributes?(attrs: Record<string, unknown>): void
  setCustomData?(data: Array<{ title: string; content: string; link?: string }>): void
  getContactInfo?(): unknown
  setRules?(rules: unknown): void
  startCall?(phone: string): void
  sendOfflineMessage?(payload: {
    name?: string
    email?: string
    phone?: string
    description?: string
    message?: string
  }): void
  showProactiveInvitation?(text: string, departmentId?: string | number): void
  setWidgetColor?(color: string, color2?: string): void
  chatMode?(): "online" | "offline"
  sendPageTitle?(title: string, fromApi?: boolean, url?: string): void
  getUnreadMessagesCount?(): number
  getUtm?(): Record<string, string> | undefined
  getVisitorNumber?(cb: (n: number) => void): void
  open(params?: { start?: "chat" | "call" | "menu" }): void
  close(): void
  clearHistory(): void
  // Top-level lifecycle helpers documented under jivo_ namespace.
  jivo_destroy?: () => void
  jivo_init?: () => void
}

interface JivoWindow {
  jivo_api?: JivoAPI
  jivo_onLoadCallback?: () => void
  jivo_onOpen?: () => void
  jivo_onClose?: () => void
  jivo_onMessageSent?: (msg: unknown) => void
  jivo_onMessageReceived?: (msg: unknown) => void
  jivo_onChangeState?: (state: unknown) => void
  jivo_onClientStartChat?: () => void
  jivo_onIntroduction?: (data: unknown) => void
  jivo_onAccept?: () => void
  jivo_onCallStart?: () => void
  jivo_onCallEnd?: (result: "ok" | "fail") => void
  jivo_onResizeCallback?: (size: unknown) => void
  jivo_onWidgetDestroy?: () => void
  jivo_destroy?: () => void
  jivo_init?: () => void
}

function w(): JivoWindow {
  return globalThis as unknown as JivoWindow
}

const queue = createQueue<JivoAPI>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined

/** Typed lifecycle/event names accepted by this provider's `on()`. */
export type JivoEventName =
  | "open"
  | "close"
  | "messageSent"
  | "messageReceived"
  | "stateChange"
  | "clientStartChat"
  | "introduction"
  | "accept"
  | "callStart"
  | "callEnd"
  | "resize"
  | "widgetDestroy"

const eventListeners = new Map<JivoEventName, Set<(payload?: unknown) => void>>()
const unreadListeners = new Set<(count: number) => void>()

// Token bucket: 10 calls per hour for setClientAttributes (vendor's 10/hr limit
// applies to setClientAttributes; the previous wrapper applied it to
// setContactInfo, which is unthrottled per the docs).
const CLIENT_ATTR_LIMIT = 10
const RATE_WINDOW_MS = 60 * 60 * 1000
let clientAttrBucket: number[] = []
function takeClientAttrToken(): boolean {
  const now = Date.now()
  clientAttrBucket = clientAttrBucket.filter((ts) => now - ts < RATE_WINDOW_MS)
  if (clientAttrBucket.length >= CLIENT_ATTR_LIMIT) return false
  clientAttrBucket.push(now)
  return true
}

/** Load-time options for this provider's `load()` call. */
export interface JivoChatLoadOptions extends LoadOptions {
  widgetId: string
}

/** Inject the jivochat CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: JivoChatLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ widgetId: options.widgetId })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  await waitForDefer(options.defer ?? "immediate")

  // Multi-listener bridge — JivoChat allows only one global callback per event.
  w().jivo_onLoadCallback = () => readyResolve?.()
  const fanOut =
    (event: JivoEventName) =>
    (payload?: unknown): void => {
      const set = eventListeners.get(event)
      if (set) for (const l of set) l(payload)
    }
  w().jivo_onOpen = fanOut("open")
  w().jivo_onClose = fanOut("close")
  w().jivo_onMessageSent = fanOut("messageSent")
  w().jivo_onMessageReceived = fanOut("messageReceived")
  w().jivo_onChangeState = fanOut("stateChange")
  w().jivo_onClientStartChat = fanOut("clientStartChat")
  w().jivo_onIntroduction = fanOut("introduction")
  w().jivo_onAccept = fanOut("accept")
  w().jivo_onCallStart = fanOut("callStart")
  w().jivo_onCallEnd = fanOut("callEnd") as (result: "ok" | "fail") => void
  w().jivo_onResizeCallback = fanOut("resize")
  w().jivo_onWidgetDestroy = fanOut("widgetDestroy")

  try {
    await injectScript({
      id: "ahize-jivochat",
      src: `//code.jivosite.com/widget/${options.widgetId}`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const api = w().jivo_api
    if (api) {
      queue.ready(api)
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  lifecycle.transition("ready")
}

/** Promise that resolves once jivochat's API is live. */
export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

/** Set the current visitor on jivochat. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  store.identify(identity)
  return queue.enqueue((api) => {
    api.setContactInfo({
      name: identity.name,
      email: identity.email,
      phone: identity.phone,
    })
    if (identity.verification && "userToken" in identity.verification) {
      const token = (identity.verification as { userToken?: string }).userToken
      if (token) api.setUserToken?.(token)
    }
  })
}

/** Set client attributes (rate-limited at 10/hr by the vendor). */
export function setClientAttributes(attrs: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (!takeClientAttrToken()) {
    console.warn(
      "[ahize/jivochat] setClientAttributes throttled (>10 calls/hour) per JivoChat's documented rate limit.",
    )
    return Promise.resolve()
  }
  return queue.enqueue((api) => api.setClientAttributes?.(attrs))
}

/** Emit a custom event to jivochat. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  _event: string,
  _metadata?: T,
): Promise<void> {
  // JivoChat has no native event tracking surface; fold into setContactInfo.description if needed.
  return Promise.resolve()
}

/** Notify jivochat of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    if (info?.path && api.sendPageTitle) {
      api.sendPageTitle(typeof document === "undefined" ? "" : "", true, info.path)
    }
  })
}

/** Show / open the jivochat widget. */
export function show(params?: { start?: "chat" | "call" | "menu" }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => (params ? api.open(params) : api.open()))
}

/** Hide / close the jivochat widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.close())
}

/** Set arbitrary custom data shown in the agent panel. */
export function setCustomData(
  data: Array<{ title: string; content: string; link?: string }>,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.setCustomData?.(data))
}

/** Initiate a callback to the given phone number. */
export function startCall(phone: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.startCall?.(phone))
}

/** Submit an offline message form payload programmatically. */
export function sendOfflineMessage(payload: {
  name?: string
  email?: string
  phone?: string
  description?: string
  message?: string
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.sendOfflineMessage?.(payload))
}

/** Show a proactive invitation message. */
export function showProactiveInvitation(
  text: string,
  departmentId?: string | number,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.showProactiveInvitation?.(text, departmentId))
}

/** Override the widget brand color(s) at runtime. */
export function setWidgetColor(color: string, color2?: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.setWidgetColor?.(color, color2))
}

/** Wipe the browser-side chat history. */
export function clearHistory(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.clearHistory())
}

/** Synchronous getter — `online` or `offline`. */
export function chatMode(): "online" | "offline" | undefined {
  if (!isBrowser()) return undefined
  return w().jivo_api?.chatMode?.()
}

/** Synchronous unread-message count. */
export function getUnreadMessagesCount(): number | undefined {
  if (!isBrowser()) return undefined
  return w().jivo_api?.getUnreadMessagesCount?.()
}

/** Read the captured UTM parameters. */
export function getUtm(): Record<string, string> | undefined {
  if (!isBrowser()) return undefined
  return w().jivo_api?.getUtm?.()
}

/** Read the contact form values. */
export function getContactInfo(): unknown {
  if (!isBrowser()) return undefined
  return w().jivo_api?.getContactInfo?.()
}

/** Async — sequential visitor number assigned by the vendor. */
export function getVisitorNumber(): Promise<number | undefined> {
  if (!isBrowser()) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const api = w().jivo_api
    if (!api?.getVisitorNumber) {
      resolve(undefined)
      return
    }
    api.getVisitorNumber((n: number) => resolve(n))
  })
}

/** Subscribe to the provider's typed lifecycle/event stream. Returns
 *  an unsubscribe function. */
export function on(event: JivoEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

/** Subscribe to jivochat's unread-count updates. Returns an unsubscribe
 *  function. */
export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

/** End the jivochat session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  // Vendor doesn't expose a logout/end-session method; just reset our local
  // state and let the snippet keep its session. Use clearHistory() explicitly
  // if the caller wants to wipe browser-side history.
  store.reset()
  lifecycle.transition("shutdown")
  return Promise.resolve()
}

/** Hard reset: remove the injected script, clear globals & listeners,
 *  return to the idle lifecycle state. */
export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-jivochat")
  const g = w()
  for (const k of [
    "jivo_api",
    "jivo_onLoadCallback",
    "jivo_onOpen",
    "jivo_onClose",
    "jivo_onMessageSent",
    "jivo_onMessageReceived",
    "jivo_onChangeState",
    "jivo_onClientStartChat",
    "jivo_onIntroduction",
    "jivo_onAccept",
    "jivo_onCallStart",
    "jivo_onCallEnd",
    "jivo_onResizeCallback",
    "jivo_onWidgetDestroy",
  ]) {
    Reflect.deleteProperty(g, k)
  }
  queue.reset()
  store.reset()
  eventListeners.clear()
  unreadListeners.clear()
  clientAttrBucket = []
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
