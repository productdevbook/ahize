/**
 * Help Scout Beacon 2 — wrapped under the unified `ahize` provider surface.
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

type BeaconFn = (method: string, ...args: unknown[]) => void

interface BeaconWindow {
  Beacon?: BeaconFn
}

function w(): BeaconWindow {
  return globalThis as unknown as BeaconWindow
}

const queue = createQueue<BeaconFn>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined

/** Mode/variant value accepted by this provider. */
export type BeaconMode = "selfService" | "neutral" | "askFirst"

/** Vendor-specific configuration object. */
export interface BeaconDisplayConfig {
  style?: "icon" | "text" | "iconAndText"
  text?: string
  position?: "left" | "right"
  zIndex?: number
  horizontalOffset?: number | string
  verticalOffset?: number | string
}

/** Vendor-specific configuration object. */
export interface BeaconMessagingConfig {
  chatEnabled?: boolean
  contactForm?: {
    customFieldsEnabled?: boolean
    showName?: boolean
    showSubject?: boolean
    allowAttachments?: boolean
  }
}

/** Vendor-specific configuration object. */
export interface BeaconConfig {
  docsEnabled?: boolean
  messagingEnabled?: boolean
  enableFabAnimation?: boolean
  enablePreviousMessages?: boolean
  enableSounds?: boolean
  color?: string
  mode?: BeaconMode
  hideAvatars?: boolean
  hideFABOnMobile?: boolean
  display?: BeaconDisplayConfig
  messaging?: BeaconMessagingConfig
  labels?: Record<string, string>
}

/** Load-time options for this provider's `load()` call. */
export interface HelpScoutLoadOptions extends LoadOptions {
  beaconId: string
  /** Optional Beacon `init` config object (display, color, mode, labels, etc.). */
  config?: BeaconConfig
}

/** Inject the helpscout CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: HelpScoutLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ beaconId: options.beaconId })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  await waitForDefer(options.defer ?? "immediate")

  try {
    await injectScript({
      id: "ahize-helpscout",
      src: "https://beacon-v2.helpscout.net",
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const beacon = w().Beacon
    if (typeof beacon === "function") {
      const initArg = options.config
        ? { beaconId: options.beaconId, ...options.config }
        : options.beaconId
      beacon("init", initArg)
      beacon("on", "ready", () => {
        queue.ready(beacon)
        readyResolve?.()
      })
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  lifecycle.transition("ready")
}

/** Promise that resolves once helpscout's API is live. */
export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

/** Set the current visitor on helpscout. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (identity.verification && identity.verification.kind !== "hmac") {
    return Promise.reject(new Error("HelpScout Beacon requires HMAC verification (kind: 'hmac')"))
  }
  store.identify(identity)
  return queue.enqueue((Beacon) => {
    const payload: Record<string, unknown> = {
      name: identity.name,
      email: identity.email,
      ...identity.attributes,
    }
    if (identity.verification?.kind === "hmac") payload["signature"] = identity.verification.hash
    Beacon("identify", payload)
  })
}

/** Emit a custom event to helpscout. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => {
    Beacon("event", { type: event, url: location.href, ...metadata })
  })
}

/** Notify helpscout of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(info?: { path?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  const url = info?.path ?? location.href
  return queue.enqueue((Beacon) => Beacon("event", { type: "page-viewed", url }))
}

/** Suggest help-center articles to the visitor (max 10). */
export function suggest(articleIds: string[]): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  let ids = articleIds
  if (articleIds.length > 10) {
    console.warn(
      `[ahize/helpscout] suggest() accepts at most 10 article IDs; got ${articleIds.length}, truncating.`,
    )
    ids = articleIds.slice(0, 10)
  }
  return queue.enqueue((Beacon) => Beacon("suggest", ids))
}

/** Documented navigation routes inside the widget. */
export type BeaconRoute =
  | "/ask/"
  | "/ask/message/"
  | "/ask/chat/"
  | "/answers/"
  | "/ai-answers/"
  | "/previous-messages/"
  | (string & {})

/** Navigate to a specific screen / route inside the widget. */
export function navigate(path: BeaconRoute): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("navigate", path))
}

/** Trigger a help-center / docs search inside the widget. */
export function search(query: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("search", query))
}

/** Open a specific article in the widget. */
export function article(
  articleId: string,
  options?: { type?: "sidebar" | "modal" },
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) =>
    options ? Beacon("article", articleId, options) : Beacon("article", articleId),
  )
}

/** Attach short-lived conversation attributes (key/value pairs). */
export function sessionData(data: Record<string, string>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("session-data", data))
}

/** Apply runtime configuration overrides to the widget. */
export function config(next: BeaconConfig): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("config", next))
}

/** Reset transient widget state (form fields, etc.). */
export function reset(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("reset"))
}

/** Toggle the chat panel between open and closed. */
export function toggle(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("toggle"))
}

/** Open the widget pre-filled with a question for AI Answers. */
export function askQuestion(question: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("ask-question", question))
}

/** Programmatically display a triggered message by id. */
export function showMessage(
  id: string,
  options?: { delay?: number; force?: boolean },
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) =>
    options ? Beacon("show-message", id, options) : Beacon("show-message", id),
  )
}

/** Read the widget's current introspection state. */
export function info(): Promise<unknown> {
  if (!isBrowser()) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    queue
      .enqueue((Beacon) => {
        const result = (Beacon as unknown as (cmd: string) => unknown)("info")
        resolve(result)
      })
      .catch(() => resolve(undefined))
  })
}

/** Pre-fill the contact form fields. */
export function prefill(payload: {
  name?: string
  email?: string
  subject?: string
  text?: string
  fields?: Array<{ id: number; value: string }>
  /** Up to 3 file attachments. */
  attachments?: Array<{ url: string; filename: string }>
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("prefill", payload))
}

/** Typed lifecycle/event names accepted by `on()` / `once()`. */
export type BeaconEvent =
  | "ready"
  | "open"
  | "close"
  | "article-viewed"
  | "email-sent"
  | "chat-started"
  | "chat-ended"
  | "search"
  | "message-clicked"
  | "message-closed"
  | "message-triggered"

/** Subscribe to the provider's typed lifecycle/event stream. Returns
 *  an unsubscribe function. */
export function on(event: BeaconEvent, listener: (payload: unknown) => void): () => void {
  if (!isBrowser()) return () => {}
  let removed = false
  queue.enqueue((Beacon) => {
    if (!removed) Beacon("on", event, listener)
  })
  return () => {
    removed = true
    queue.enqueue((Beacon) => Beacon("off", event, listener))
  }
}

/** One-shot variant of `on()` — fires the listener at most once. */
export function once(event: BeaconEvent, listener: (payload: unknown) => void): () => void {
  if (!isBrowser()) return () => {}
  let removed = false
  queue.enqueue((Beacon) => {
    if (!removed) Beacon("once", event, listener)
  })
  return () => {
    removed = true
    queue.enqueue((Beacon) => Beacon("off", event, listener))
  }
}

/** Show / open the helpscout widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("open"))
}

/** Hide / close the helpscout widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("close"))
}

/** End the helpscout session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(opts?: {
  endActiveChat?: boolean
  clearMessages?: boolean
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  const payload: Record<string, unknown> = { endActiveChat: opts?.endActiveChat ?? true }
  if (opts?.clearMessages !== undefined) payload["clearMessages"] = opts.clearMessages
  return queue
    .enqueue((Beacon) => Beacon("logout", payload))
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
  const beacon = w().Beacon
  beacon?.("destroy")
  removeScript("ahize-helpscout")
  const g = w()
  Reflect.deleteProperty(g, "Beacon")
  queue.reset()
  store.reset()
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
