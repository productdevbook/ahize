/**
 * LiveAgent (QualityUnit) chat button — wrapped under the unified `ahize` provider surface.
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

interface LiveAgentButton {
  onOnline?: () => void
  onOffline?: () => void
  onClick?: () => void
  onCloseFunction_?: () => void
}

interface LiveAgentInstance {
  hasOpenedWidget?(): boolean
}

interface LiveAgentAPI {
  setUserDetails(email?: string, firstName?: string, lastName?: string, phone?: string): void
  addUserDetail?(key: "email" | "firstName" | "lastName" | "phone", value: string): void
  addContactField(field: string, value: unknown): void
  addTicketField?(key: string, value: unknown): void
  clearAllUserDetails?(): void
  setVisitorLocation?(url: string): void
  disableOnlineVisitorsTracking?(): void
  createButton(buttonId: string, container?: unknown): LiveAgentButton | undefined
  createForm?(formId: string, container?: unknown): LiveAgentButton | undefined
  hideButton?(buttonId: string): void
  instance?: LiveAgentInstance
}

interface LiveAgentWindow {
  LiveAgent?: LiveAgentAPI
}

function w(): LiveAgentWindow {
  return globalThis as unknown as LiveAgentWindow
}

const queue = createQueue<LiveAgentAPI>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
let currentSubdomain: string | undefined
let currentButtonId: string | undefined

/** Typed lifecycle/event names accepted by this provider's `on()`. */
export type LiveAgentEventName = "online" | "offline" | "chatStarted" | "chatEnded"
const eventListeners = new Map<LiveAgentEventName, Set<() => void>>()

/** Load-time options for this provider's `load()` call. */
export interface LiveAgentLoadOptions extends LoadOptions {
  /** e.g. "yourcompany" — yourcompany.ladesk.com */
  accountSubdomain: string
  buttonId: string
  /** Self-hosted base URL override (e.g. "https://support.example.com"). */
  selfHostedBaseUrl?: string
  /** When true, calls LiveAgent.disableOnlineVisitorsTracking() before createButton. */
  disableOnlineVisitorsTracking?: boolean
}

/** Inject the liveagent CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: LiveAgentLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({
    sub: options.accountSubdomain,
    button: options.buttonId,
    base: options.selfHostedBaseUrl,
  })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  currentSubdomain = options.accountSubdomain
  currentButtonId = options.buttonId
  await waitForDefer(options.defer ?? "immediate")

  const base = options.selfHostedBaseUrl ?? `https://${options.accountSubdomain}.ladesk.com`

  try {
    await injectScript({
      id: "ahize-liveagent",
      src: `${base}/scripts/track.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const api = w().LiveAgent
    if (api) {
      if (options.disableOnlineVisitorsTracking) api.disableOnlineVisitorsTracking?.()
      const button = api.createButton(options.buttonId)
      if (button) {
        // Vendor pattern: monkey-patch button.onClick / onCloseFunction_ for chat
        // start/end, and onOnline / onOffline for agent availability.
        button.onClick = () => {
          for (const l of eventListeners.get("chatStarted") ?? []) l()
        }
        button.onCloseFunction_ = () => {
          for (const l of eventListeners.get("chatEnded") ?? []) l()
        }
        button.onOnline = () => {
          for (const l of eventListeners.get("online") ?? []) l()
        }
        button.onOffline = () => {
          for (const l of eventListeners.get("offline") ?? []) l()
        }
      }
      queue.ready(api)
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  lifecycle.transition("ready")
}

/** Promise that resolves once liveagent's API is live. */
export function ready(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(() => {})
}

/** Set the current visitor on liveagent. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  store.identify(identity)
  return queue.enqueue((api) => {
    const [first, ...rest] = (identity.name ?? "").split(" ")
    api.setUserDetails(identity.email ?? "", first ?? "", rest.join(" "), identity.phone ?? "")
    if (identity.attributes) {
      for (const [k, v] of Object.entries(identity.attributes)) api.addContactField(k, v)
    }
  })
}

/** Emit a custom event to liveagent. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    api.addContactField(event, metadata ?? true)
  })
}

/** Notify liveagent of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    if (info?.path && api.setVisitorLocation) api.setVisitorLocation(info.path)
  })
}

/** Update a single user property without touching the others. */
export function addUserDetail(
  key: "email" | "firstName" | "lastName" | "phone",
  value: string,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.addUserDetail?.(key, value))
}

/** Set a custom ticket field. */
export function addTicketField(key: string, value: unknown): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.addTicketField?.(key, value))
}

/** Clear all user properties and contact/ticket fields. */
export function clearAllUserDetails(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.clearAllUserDetails?.())
}

/** Set the visitor's current page URL inside the conversation. */
export function setVisitorLocation(url: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.setVisitorLocation?.(url))
}

/** Create an offline contact-form widget (alternative to createButton). */
export function createForm(formId: string, container?: unknown): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.createForm?.(formId, container))
}

/** Synchronous check — `true` if any widget is currently open. */
export function hasOpenedWidget(): boolean | undefined {
  if (!isBrowser()) return undefined
  return w().LiveAgent?.instance?.hasOpenedWidget?.()
}

/** Subscribe to the provider's typed lifecycle/event stream. Returns
 *  an unsubscribe function. */
export function on(event: LiveAgentEventName, listener: () => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

/** Show / open the liveagent widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(() => {
    // LiveAgent button visibility is managed via CSS on the injected button container.
  })
}

/** Hide / close the liveagent widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    if (currentButtonId) api.hideButton?.(currentButtonId)
  })
}

/** End the liveagent session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((api) => api.clearAllUserDetails?.())
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
  removeScript("ahize-liveagent")
  const g = w()
  Reflect.deleteProperty(g, "LiveAgent")
  queue.reset()
  store.reset()
  eventListeners.clear()
  currentSubdomain = undefined
  currentButtonId = undefined
  lifecycle.clearConfigHash()
  lifecycle.transition("idle")
}

/** Read the wrapper's currently-resolved configuration. */
export function getConfig(): { subdomain?: string; buttonId?: string } {
  return { subdomain: currentSubdomain, buttonId: currentButtonId }
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
