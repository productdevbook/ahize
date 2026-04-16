/**
 * Crisp chatbox — wrapped under the unified `ahize` provider surface.
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
import type {
  EventMetadata,
  Identity,
  IdentityListener,
  IdentityState,
  LoadOptions,
} from "../_types.ts"

type CrispCmd = unknown[]

interface CrispArray extends Array<CrispCmd> {
  push(cmd: CrispCmd): number
}

interface CrispWindow {
  $crisp?: CrispArray
  CRISP_WEBSITE_ID?: string
  CRISP_TOKEN_ID?: string
  CRISP_RUNTIME_CONFIG?: Record<string, unknown>
}

function w(): CrispWindow {
  return globalThis as unknown as CrispWindow
}

function bus(): CrispArray {
  const g = w()
  if (!g.$crisp) g.$crisp = [] as unknown as CrispArray
  return g.$crisp
}

const store = createIdentityStore()
const lifecycle = createLifecycle()
const unreadListeners = new Set<(count: number) => void>()

/** Typed lifecycle/event names accepted by this provider's `on()`. */
export type CrispEventName =
  | "chatOpened"
  | "chatClosed"
  | "chatInitiated"
  | "messageSent"
  | "messageReceived"
  | "messageComposeSent"
  | "messageComposeReceived"
  | "helpdeskQueried"
  | "userEmailChanged"
  | "userPhoneChanged"
  | "userNicknameChanged"
  | "userAvatarChanged"
  | "websiteAvailabilityChanged"

const CRISP_EVENT_MAP: Record<string, CrispEventName> = {
  "chat:opened": "chatOpened",
  "chat:closed": "chatClosed",
  "chat:initiated": "chatInitiated",
  "message:sent": "messageSent",
  "message:received": "messageReceived",
  "message:compose:sent": "messageComposeSent",
  "message:compose:received": "messageComposeReceived",
  "helpdesk:queried": "helpdeskQueried",
  "user:email:changed": "userEmailChanged",
  "user:phone:changed": "userPhoneChanged",
  "user:nickname:changed": "userNicknameChanged",
  "user:avatar:changed": "userAvatarChanged",
  "website:availability:changed": "websiteAvailabilityChanged",
}

const eventListeners = new Map<CrispEventName, Set<(payload?: unknown) => void>>()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined

const ASCII_KEY = /^[a-z0-9_\-:]+$/i
function validateDataKey(key: string): void {
  if (!ASCII_KEY.test(key)) {
    console.warn(
      `[ahize/crisp] setData key '${key}' contains non-ASCII / unsupported chars; Crisp will drop it.`,
    )
  }
}

/** Load-time options for this provider's `load()` call. */
export interface CrispLoadOptions extends LoadOptions {
  websiteId: string
  tokenId?: string
  locale?: string
  /** Suppress SDK errors instead of throwing. */
  safeMode?: boolean
  /** Restrict the chatbox cookie to this domain (e.g. ".example.com"). */
  cookieDomain?: string
  /** Custom cookie lifetime in seconds (default: ~6 months). */
  cookieExpire?: number
  /** Merge sessions across pages/tabs. */
  sessionMerge?: boolean
  /** Force the chatbox to stay maximized. */
  lockMaximized?: boolean
  /** Force the chatbox into fullview mode. */
  lockFullview?: boolean
}

/** Inject the crisp CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: CrispLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ websiteId: options.websiteId, tokenId: options.tokenId })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  await waitForDefer(options.defer ?? "immediate")
  bus()
  w().CRISP_WEBSITE_ID = options.websiteId
  if (options.tokenId) w().CRISP_TOKEN_ID = options.tokenId
  const runtime: Record<string, unknown> = { ...w().CRISP_RUNTIME_CONFIG }
  if (options.locale !== undefined) runtime["locale"] = options.locale
  if (options.safeMode !== undefined) runtime["safeMode"] = options.safeMode
  if (options.cookieDomain !== undefined) runtime["cookieDomain"] = options.cookieDomain
  if (options.cookieExpire !== undefined) runtime["cookieExpire"] = options.cookieExpire
  if (options.sessionMerge !== undefined) runtime["sessionMerge"] = options.sessionMerge
  if (options.lockMaximized !== undefined) runtime["lockMaximized"] = options.lockMaximized
  if (options.lockFullview !== undefined) runtime["lockFullview"] = options.lockFullview
  if (Object.keys(runtime).length > 0) w().CRISP_RUNTIME_CONFIG = runtime
  try {
    await injectScript({
      id: "ahize-crisp",
      src: "https://client.crisp.chat/l.js",
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }
  bus().push([
    "on",
    "session:loaded",
    () => {
      readyResolve?.()
    },
  ])
  // Wire every documented Crisp lifecycle event to the typed emitter.
  for (const [domName, mapped] of Object.entries(CRISP_EVENT_MAP)) {
    bus().push([
      "on",
      domName,
      (payload: unknown) => {
        const set = eventListeners.get(mapped)
        if (!set) return
        for (const l of set) l(payload)
      },
    ])
  }
  lifecycle.transition("ready")
}

/** Promise that resolves once crisp's API is live. */
export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

/** Set arbitrary session data on the visitor. */
export function setData(data: Record<string, string | number | boolean>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  const pairs: unknown[][] = []
  for (const [k, v] of Object.entries(data)) {
    validateDataKey(k)
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
      console.warn(`[ahize/crisp] setData value for '${k}' must be string|number|boolean`)
      continue
    }
    pairs.push([k, v])
  }
  if (pairs.length > 0) bus().push(["set", "session:data", [pairs]])
  return Promise.resolve()
}

/** Company metadata accepted by `setCompany()`. */
export interface CrispCompany {
  name?: string
  url?: string
  description?: string
  employment?: [title: string, role?: string]
  geolocation?: { country?: string; city?: string }
}
/** Attach company facts to the visitor. */
export function setCompany(company: CrispCompany): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["set", "user:company", [company.name ?? "", company]])
  return Promise.resolve()
}

/** Subscribe to crisp's unread-count updates. Returns an unsubscribe
 *  function. */
export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  if (isBrowser()) {
    bus().push([
      "on",
      "session:unread",
      (count: number) => {
        for (const l of unreadListeners) l(count)
      },
    ])
  }
  return () => unreadListeners.delete(listener)
}

/** Hot-swap the configuration without a full destroy/load cycle. */
export async function reconfigure(next: CrispLoadOptions): Promise<void> {
  if (!isBrowser()) return
  await destroy()
  await load(next)
}

/** Set the current visitor on crisp. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (identity.verification && identity.verification.kind !== "hmac") {
    return Promise.reject(new Error("Crisp requires HMAC verification (kind: 'hmac')"))
  }
  store.identify(identity)
  const q = bus()
  if (identity.email) {
    const args: unknown[] = [identity.email]
    if (identity.verification?.kind === "hmac") args.push(identity.verification.hash)
    q.push(["set", "user:email", args])
  }
  if (identity.name) q.push(["set", "user:nickname", [identity.name]])
  if (identity.phone) q.push(["set", "user:phone", [identity.phone]])
  if (identity.attributes) {
    const pairs: unknown[][] = []
    for (const [k, v] of Object.entries(identity.attributes)) pairs.push([k, v])
    if (pairs.length > 0) q.push(["set", "session:data", [pairs]])
  }
  return Promise.resolve()
}

/** Notify crisp of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  const q = bus()
  if (info?.path) q.push(["set", "session:event", [[["page:viewed", { path: info.path }]]]])
  if (info?.locale) q.push(["set", "session:data", [[["locale", info.locale]]]])
  return Promise.resolve()
}

/** Emit a custom event to crisp. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["set", "session:event", [[[event, metadata]]]])
  return Promise.resolve()
}

/** Show / open the crisp widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  // Reveal the chat without forcibly expanding the panel.
  bus().push(["do", "chat:show"])
  return Promise.resolve()
}

/** Hide / close the crisp widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "chat:hide"])
  return Promise.resolve()
}

/** Open / expand the chat panel. */
export function open(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "chat:open"])
  return Promise.resolve()
}

/** Close / collapse the chat panel. */
export function close(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "chat:close"])
  return Promise.resolve()
}

/** Toggle the chat panel between open and closed. */
export function toggle(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "chat:toggle"])
  return Promise.resolve()
}

/** Send a message programmatically as the visitor. */
export function sendMessage(text: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "message:send", ["text", text]])
  return Promise.resolve()
}

/** Display a local-only operator message in the chat. */
export function showLocalMessage(text: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "message:show", ["text", text]])
  return Promise.resolve()
}

/** Mark all unread messages as read. */
export function markRead(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "message:read"])
  return Promise.resolve()
}

/** Pre-fill the composer's message input. */
export function setMessageText(text: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["set", "message:text", [text]])
  return Promise.resolve()
}

/** Set the visitor's avatar URL. */
export function setUserAvatar(url: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["set", "user:avatar", [url]])
  return Promise.resolve()
}

/** Tag the session with segments (overwrite or append). */
export function setSessionSegments(segments: string[], overwrite = false): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["set", "session:segments", [segments, overwrite]])
  return Promise.resolve()
}

/** Trigger a helpdesk search inside the widget. */
export function helpdeskSearch(query: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "helpdesk:search", [query]])
  return Promise.resolve()
}

/** Open a helpdesk article inside the widget. */
export function helpdeskArticleOpen(locale: string, slug: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "helpdesk:article:open", [locale, slug]])
  return Promise.resolve()
}

/** Run a vendor-side trigger by id. */
export function runTrigger(triggerId: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "trigger:run", [triggerId]])
  return Promise.resolve()
}

/** Subscribe to the provider's typed lifecycle/event stream. Returns
 *  an unsubscribe function. */
export function on(event: CrispEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

/** End the crisp session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  bus().push(["do", "session:reset"])
  store.reset()
  lifecycle.transition("shutdown")
  return Promise.resolve()
}

/** Hard reset: remove the injected script, clear globals & listeners,
 *  return to the idle lifecycle state. */
export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-crisp")
  const g = w()
  Reflect.deleteProperty(g, "$crisp")
  Reflect.deleteProperty(g, "CRISP_WEBSITE_ID")
  Reflect.deleteProperty(g, "CRISP_TOKEN_ID")
  Reflect.deleteProperty(g, "CRISP_RUNTIME_CONFIG")
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
