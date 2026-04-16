/**
 * Chatwoot live-chat & support widget — wrapped under the unified `ahize` provider surface.
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

interface ChatwootSDK {
  run(options: { websiteToken: string; baseUrl: string }): void
}

interface ChatwootAPI {
  setUser(identifier: string, user: Record<string, unknown>): void
  setCustomAttributes(attrs: Record<string, unknown>): void
  setConversationCustomAttributes?(attrs: Record<string, unknown>): void
  deleteCustomAttribute?(key: string): void
  deleteConversationCustomAttribute?(key: string): void
  setLabel(label: string): void
  removeLabel?(label: string): void
  setLocale?(locale: string): void
  setColorScheme?(mode: "light" | "dark" | "auto"): void
  popoutChatWindow?(): void
  toggle(state?: "open" | "close"): void
  toggleBubbleVisibility?(state: "show" | "hide"): void
  reset(): void
  isOpen?: boolean
}

interface ChatwootWindow {
  chatwootSDK?: ChatwootSDK
  $chatwoot?: ChatwootAPI
  chatwootSettings?: Record<string, unknown>
}

function w(): ChatwootWindow {
  return globalThis as unknown as ChatwootWindow
}

const queue = createQueue<ChatwootAPI>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
const unreadListeners = new Set<(count: number) => void>()
type ChatwootEventName =
  | "ready"
  | "message"
  | "unreadCountChange"
  | "error"
  | "opened"
  | "closed"
  | "startConversation"
  | "postback"
const eventListeners = new Map<ChatwootEventName, Set<(payload: unknown) => void>>()
let currentToken: string | undefined
let currentBaseUrl: string | undefined
let readyListener: (() => void) | undefined
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined
const dispatchedDomEvents = new Map<ChatwootEventName, () => void>()

function fire(name: ChatwootEventName, payload: unknown): void {
  const set = eventListeners.get(name)
  if (!set) return
  for (const l of set) l(payload)
  if (name === "unreadCountChange") {
    const count = (payload as { unreadMessageCount?: number } | undefined)?.unreadMessageCount ?? 0
    for (const l of unreadListeners) l(count)
  }
}

function bindDomEvent(domName: string, mapped: ChatwootEventName): void {
  if (!isBrowser()) return
  if (dispatchedDomEvents.has(mapped)) return
  const handler = (event: Event) => {
    const detail = (event as Event & { detail?: unknown }).detail
    fire(mapped, detail)
  }
  window?.addEventListener?.(domName, handler as () => void)
  dispatchedDomEvents.set(mapped, () =>
    window?.removeEventListener?.(domName, handler as () => void),
  )
}

function normalizeBaseUrl(url: string): string {
  let u = url.trim()
  if (!/^https?:\/\//.test(u)) u = `https://${u}`
  while (u.endsWith("/")) u = u.slice(0, -1)
  return u
}

const TYPED_SETTINGS_KEYS = [
  "type",
  "widgetStyle",
  "darkMode",
  "position",
  "locale",
  "useBrowserLanguage",
  "hideMessageBubble",
  "showPopoutButton",
  "showUnreadMessagesDialog",
  "launcherTitle",
  "baseDomain",
] as const satisfies ReadonlyArray<keyof ChatwootLoadOptions>

/** Load-time options for this provider's `load()` call. */
export interface ChatwootLoadOptions extends LoadOptions {
  websiteToken: string
  baseUrl?: string
  /** Bubble design. */
  type?: "standard" | "expanded_bubble"
  /** Widget chrome variant. */
  widgetStyle?: "standard" | "flat"
  /** Initial color scheme; runtime override available via setColorScheme(). */
  darkMode?: "light" | "auto"
  /** Bubble alignment. */
  position?: "left" | "right"
  /** Initial locale; runtime override available via setLocale(). */
  locale?: string
  /** When true, Chatwoot picks the locale from the visitor's browser. */
  useBrowserLanguage?: boolean
  /** Hide the floating message bubble. */
  hideMessageBubble?: boolean
  /** Show a popout button inside the widget header. */
  showPopoutButton?: boolean
  /** Show the unread-messages dialog. */
  showUnreadMessagesDialog?: boolean
  /** Custom launcher button title. */
  launcherTitle?: string
  /** Cookie domain (typically used for cross-subdomain identity). */
  baseDomain?: string
  /** Escape hatch for any setting not yet typed; merged before typed fields. */
  settings?: Record<string, unknown>
}

/** Inject the chatwoot CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: ChatwootLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? "https://app.chatwoot.com")
  const h = hashConfig({ websiteToken: options.websiteToken, baseUrl })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  currentToken = options.websiteToken
  currentBaseUrl = baseUrl
  await waitForDefer(options.defer ?? "immediate")
  const settings: Record<string, unknown> = { ...options.settings }
  for (const key of TYPED_SETTINGS_KEYS) {
    const v = options[key]
    if (v !== undefined) settings[key] = v
  }
  if (Object.keys(settings).length > 0) w().chatwootSettings = settings

  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  readyListener = () => {
    const api = w().$chatwoot
    if (api) queue.ready(api)
    readyResolve?.()
    fire("ready", undefined)
  }
  window?.addEventListener("chatwoot:ready", readyListener, { once: true })

  // Wire up the rest of Chatwoot's CustomEvents to our typed emitter.
  bindDomEvent("chatwoot:on-message", "message")
  bindDomEvent("chatwoot:on-unread-message-count-changed", "unreadCountChange")
  bindDomEvent("chatwoot:error", "error")
  bindDomEvent("chatwoot:opened", "opened")
  bindDomEvent("chatwoot:closed", "closed")
  bindDomEvent("chatwoot:on-start-conversation", "startConversation")
  bindDomEvent("chatwoot:postback", "postback")

  try {
    await injectScript({
      id: "ahize-chatwoot",
      src: `${baseUrl}/packs/js/sdk.js`,
      defer: true,
      async: false,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  w().chatwootSDK?.run({ websiteToken: options.websiteToken, baseUrl })
  lifecycle.transition("ready")
}

/** Set the current visitor on chatwoot. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (!identity.id) return Promise.resolve()
  if (identity.verification && identity.verification.kind !== "hmac") {
    return Promise.reject(new Error("Chatwoot requires HMAC verification (kind: 'hmac')"))
  }
  store.identify(identity)
  const id = identity.id
  return queue.enqueue((api) => {
    const user: Record<string, unknown> = {}
    if (identity.email) user["email"] = identity.email
    if (identity.name) user["name"] = identity.name
    if (identity.phone) user["phone_number"] = identity.phone
    if (identity.verification?.kind === "hmac") {
      user["identifier_hash"] = identity.verification.hash
    }
    if (identity.attributes) Object.assign(user, identity.attributes)
    api.setUser(id, user)
  })
}

/** Notify chatwoot of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    const attrs: Record<string, unknown> = {}
    if (info?.path) attrs["path"] = info.path
    if (Object.keys(attrs).length > 0) api.setCustomAttributes(attrs)
    if (info?.locale) api.setLocale?.(info.locale)
  })
}

/** Emit a custom event to chatwoot. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    api.setCustomAttributes({ [event]: metadata ?? true })
  })
}

/** Promise that resolves once chatwoot's API is live. */
export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

/** Subscribe to the provider's typed lifecycle/event stream. Returns
 *  an unsubscribe function. */
export function on(event: ChatwootEventName, listener: (payload: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

/** Subscribe to chatwoot's unread-count updates. Returns an unsubscribe
 *  function. */
export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

/** Set a custom attribute on the contact or conversation. */
export function setAttribute(args: {
  scope: "contact" | "conversation"
  key: string
  value: unknown
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    const payload = { [args.key]: args.value }
    if (args.scope === "conversation" && api.setConversationCustomAttributes) {
      api.setConversationCustomAttributes(payload)
    } else {
      api.setCustomAttributes(payload)
    }
  })
}

/** Apply a theme (mode + brand color) to the widget. */
export function setTheme(args: {
  mode?: "light" | "dark" | "auto"
  color?: string
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    const mode = args.mode ?? "auto"
    if (api.setColorScheme) {
      api.setColorScheme(mode)
      return
    }
    // Fallback for Chatwoot SDKs that predate setColorScheme.
    const root = document.querySelectorAll(".woot-widget-holder")
    for (let i = 0; i < root.length; i++) {
      const el = root[i] as unknown as { style?: Record<string, string> }
      if (el.style) el.style["color-scheme"] = mode
    }
  })
}

/** Switch between light / dark / auto color schemes at runtime. */
export function setColorScheme(mode: "light" | "dark" | "auto"): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.setColorScheme?.(mode))
}

/** Delete a custom attribute from the contact or conversation. */
export function deleteAttribute(args: {
  scope: "contact" | "conversation"
  key: string
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    if (args.scope === "conversation") {
      api.deleteConversationCustomAttribute?.(args.key)
    } else {
      api.deleteCustomAttribute?.(args.key)
    }
  })
}

/** Detach the chat into its own browser window. */
export function popoutChatWindow(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.popoutChatWindow?.())
}

/** Wait briefly for the widget to close, then `shutdown()`. */
export async function safeShutdown(timeoutMs = 2000): Promise<void> {
  if (!isBrowser()) return
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const api = w().$chatwoot
    if (!api || !api.isOpen) break
    await new Promise((r) => setTimeout(r, 100))
  }
  await shutdown()
}

/** Add a label to the contact. */
export function setLabel(label: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.setLabel(label))
}

/** Remove a label from the contact. */
export function removeLabel(label: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.removeLabel?.(label))
}

/** Switch the widget's locale at runtime. */
export function setLocale(locale: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.setLocale?.(locale))
}

/** Toggle the visibility of the message bubble specifically. */
export function setBubbleVisibility(state: "show" | "hide"): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.toggleBubbleVisibility?.(state))
}

/** Show / open the chatwoot widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    api.toggle("open")
  })
}

/** Hide / close the chatwoot widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    api.toggle("close")
  })
}

/** End the chatwoot session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((api) => {
      if (api.isOpen) {
        console.warn(
          "[ahize/chatwoot] shutdown() called while widget is open; closing before reset to avoid state corruption.",
        )
        api.toggle("close")
      }
      api.reset()
    })
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

const CHATWOOT_DOM_SELECTORS = [
  "#cw-widget-holder",
  "#cw-bubble-holder",
  ".woot-widget-holder",
  ".woot-widget-bubble",
  ".woot--bubble-holder",
  "iframe.woot-widget-holder",
] as const

function removeChatwootDom(): void {
  if (!isBrowser()) return
  const doc = document as unknown as {
    querySelectorAll(selector: string): ArrayLike<{ remove(): void }>
  }
  for (const selector of CHATWOOT_DOM_SELECTORS) {
    const nodes = doc.querySelectorAll(selector)
    for (let i = 0; i < nodes.length; i++) {
      nodes[i]?.remove()
    }
  }
}

function clearChatwootStorage(): void {
  if (!isBrowser()) return
  try {
    const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage
    if (!storage) return
    const drop: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && key.toLowerCase().includes("chatwoot")) drop.push(key)
    }
    for (const key of drop) storage.removeItem(key)
  } catch {
    // storage may be blocked by the browser; ignore
  }
}

/** Hard reset: remove the injected script, clear globals & listeners,
 *  return to the idle lifecycle state. */
export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-chatwoot")
  removeChatwootDom()
  clearChatwootStorage()
  if (readyListener && window) {
    window.removeEventListener?.("chatwoot:ready", readyListener)
    readyListener = undefined
  }
  for (const off of dispatchedDomEvents.values()) off()
  dispatchedDomEvents.clear()
  eventListeners.clear()
  unreadListeners.clear()
  const g = w()
  Reflect.deleteProperty(g, "chatwootSDK")
  Reflect.deleteProperty(g, "$chatwoot")
  Reflect.deleteProperty(g, "chatwootSettings")
  queue.reset()
  store.reset()
  currentToken = undefined
  currentBaseUrl = undefined
  readyPromise = undefined
  readyResolve = undefined
  lifecycle.clearConfigHash()
  lifecycle.transition("idle")
}

/** Read the wrapper's currently-resolved configuration. */
export function getConfig(): { websiteToken?: string; baseUrl?: string } {
  return { websiteToken: currentToken, baseUrl: currentBaseUrl }
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
