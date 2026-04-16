/**
 * Smartsupp chatbox — wrapped under the unified `ahize` provider surface.
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

type SmartsuppFn = (cmd: string, ...args: unknown[]) => unknown

interface SmartsuppNs extends SmartsuppFn {
  vid?: string
}

interface SmartsuppWindow {
  smartsupp?: SmartsuppNs
  _smartsupp?: { key?: string; hideWidget?: boolean; [k: string]: unknown }
}

function w(): SmartsuppWindow {
  return globalThis as unknown as SmartsuppWindow
}

const queue = createQueue<SmartsuppFn>()
const store = createIdentityStore()
const lifecycle = createLifecycle()

/** Typed lifecycle/event names accepted by this provider's `on()`. */
export type SmartsuppEventName = "messageSent" | "messageReceived" | "messengerClose"
const SMARTSUPP_EVENT_MAP: Record<string, SmartsuppEventName> = {
  message_sent: "messageSent",
  message_received: "messageReceived",
  messenger_close: "messengerClose",
}
const eventListeners = new Map<SmartsuppEventName, Set<(payload?: unknown) => void>>()

const TYPED_SETTINGS_KEYS = [
  "cookieDomain",
  "hideMobileWidget",
  "orientation",
  "offsetX",
  "offsetY",
  "color",
  "privacyNoticeEnabled",
  "privacyNoticeUrl",
  "privacyNoticeCheckRequired",
  "ratingEnabled",
  "gaKey",
  "gaOptions",
] as const

/** Load-time options for this provider's `load()` call. */
export interface SmartsuppLoadOptions extends LoadOptions {
  key: string
  /** Initial widget visibility (config-time). Use show()/hide() at runtime. */
  hideWidget?: boolean
  /** Initial language code. */
  language?: string
  /** Initial agent group id. */
  group?: string
  /** Cross-subdomain session cookie domain. */
  cookieDomain?: string
  /** Hide widget on mobile viewports. */
  hideMobileWidget?: boolean
  /** Widget alignment. */
  orientation?: "left" | "right"
  /** Pixel offset from the viewport edge. */
  offsetX?: number
  offsetY?: number
  /** Widget brand color. */
  color?: string
  /** Privacy-notice gate. */
  privacyNoticeEnabled?: boolean
  privacyNoticeUrl?: string
  privacyNoticeCheckRequired?: boolean
  /** Enable CSAT rating. */
  ratingEnabled?: boolean
  /** Google Analytics forwarding. */
  gaKey?: string
  gaOptions?: Record<string, unknown>
}

/** Inject the smartsupp CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: SmartsuppLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ key: options.key })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  await waitForDefer(options.defer ?? "immediate")

  const settings: Record<string, unknown> = { key: options.key, hideWidget: options.hideWidget }
  for (const key of TYPED_SETTINGS_KEYS) {
    const v = options[key]
    if (v !== undefined) settings[key] = v
  }
  w()._smartsupp = settings

  try {
    await injectScript({
      id: "ahize-smartsupp",
      src: "https://www.smartsuppchat.com/loader.js",
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const fn = w().smartsupp
    if (typeof fn === "function") {
      queue.ready(fn)
      if (options.language !== undefined) fn("language", options.language)
      if (options.group !== undefined) fn("group", options.group)
      for (const [vendorName, mapped] of Object.entries(SMARTSUPP_EVENT_MAP)) {
        fn("on", vendorName, (payload: unknown) => {
          const set = eventListeners.get(mapped)
          if (!set) return
          for (const l of set) l(payload)
        })
      }
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  lifecycle.transition("ready")
}

/** Promise that resolves once smartsupp's API is live. */
export function ready(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(() => {})
}

/** Set the current visitor on smartsupp. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  store.identify(identity)
  return queue.enqueue((s) => {
    if (identity.name) s("name", identity.name)
    if (identity.email) s("email", identity.email)
    if (identity.phone) s("phone", identity.phone)
    if (identity.attributes) s("variables", identity.attributes)
  })
}

/** Emit a custom event to smartsupp. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("variables", { [event]: metadata }))
}

/** Notify smartsupp of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

/** Show / open the smartsupp widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  // Clear config-time hide flag too, otherwise the snippet immediately hides again.
  const settings = w()._smartsupp
  if (settings) settings.hideWidget = false
  return queue.enqueue((s) => s("chat:show"))
}

/** Hide / close the smartsupp widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("chat:hide"))
}

/** Open / expand the chat panel. */
export function open(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("chat:open"))
}

/** Close / collapse the chat panel. */
export function close(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("chat:close"))
}

/** Pre-fill the composer with a draft message. */
export function prefillMessage(text: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("chat:message", text))
}

/** Send a message programmatically as the visitor. */
export function sendMessage(text: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("chat:send", text))
}

/** Route to a specific agent group. */
export function setGroup(group: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("group", group))
}

/** Switch the widget language at runtime. */
export function setLanguage(language: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("language", language))
}

/** Read the provider's anonymous visitor id. */
export function getVisitorId(): string | undefined {
  if (!isBrowser()) return undefined
  return w().smartsupp?.vid
}

/** Subscribe to the provider's typed lifecycle/event stream. Returns
 *  an unsubscribe function. */
export function on(event: SmartsuppEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

/** End the smartsupp session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((s) => s("logout"))
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
  removeScript("ahize-smartsupp")
  const g = w()
  Reflect.deleteProperty(g, "smartsupp")
  Reflect.deleteProperty(g, "_smartsupp")
  queue.reset()
  store.reset()
  eventListeners.clear()
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
