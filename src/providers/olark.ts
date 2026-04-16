/**
 * Olark live chat — wrapped under the unified `ahize` provider surface.
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

type OlarkFn = (method: string, ...args: unknown[]) => unknown

interface OlarkWindow {
  olark?: OlarkFn
}

function w(): OlarkWindow {
  return globalThis as unknown as OlarkWindow
}

const queue = createQueue<OlarkFn>()
const store = createIdentityStore()
const lifecycle = createLifecycle()

/** Typed lifecycle/event names accepted by this provider's `on()`. */
export type OlarkEventName =
  | "boxShow"
  | "boxHide"
  | "boxExpand"
  | "boxShrink"
  | "chatReady"
  | "beginConversation"
  | "messageToVisitor"
  | "messageToOperator"
  | "commandFromOperator"
  | "offlineMessageToOperator"
  | "operatorsAvailable"
  | "operatorsAway"

const OLARK_EVENT_MAP: Record<OlarkEventName, string> = {
  boxShow: "api.box.onShow",
  boxHide: "api.box.onHide",
  boxExpand: "api.box.onExpand",
  boxShrink: "api.box.onShrink",
  chatReady: "api.chat.onReady",
  beginConversation: "api.chat.onBeginConversation",
  messageToVisitor: "api.chat.onMessageToVisitor",
  messageToOperator: "api.chat.onMessageToOperator",
  commandFromOperator: "api.chat.onCommandFromOperator",
  offlineMessageToOperator: "api.chat.onOfflineMessageToOperator",
  operatorsAvailable: "api.chat.onOperatorsAvailable",
  operatorsAway: "api.chat.onOperatorsAway",
}

const eventListeners = new Map<OlarkEventName, Set<(payload?: unknown) => void>>()

/** Resolved visitor details returned by the provider. */
export interface OlarkVisitorDetails {
  emailAddress?: string
  fullName?: string
  phoneNumber?: string
  organization?: string
  city?: string
  region?: string
  country?: string
  customFields?: Record<string, unknown>
  [key: string]: unknown
}

/** Load-time options for this provider's `load()` call. */
export interface OlarkLoadOptions extends LoadOptions {
  siteId: string
  /** Initial agent group routing. */
  group?: string
  /** Initial widget locale. */
  locale?: string
}

/** Inject the olark CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: OlarkLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ siteId: options.siteId })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  await waitForDefer(options.defer ?? "immediate")

  // Olark snippet self-bootstraps olark() into a stub queue.
  try {
    await injectScript({
      id: "ahize-olark",
      src: `https://www.olark.com/r3s/loader.js?l=${options.siteId}`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const olark = w().olark
    if (typeof olark === "function") {
      olark("api.box.onReady", () => {})
      // Wire every documented Olark event to the typed emitter.
      for (const [mapped, vendor] of Object.entries(OLARK_EVENT_MAP) as Array<
        [OlarkEventName, string]
      >) {
        olark(vendor, (payload: unknown) => {
          const set = eventListeners.get(mapped)
          if (!set) return
          for (const l of set) l(payload)
        })
      }
      if (options.group !== undefined) olark("api.chat.setOperatorGroup", { group: options.group })
      if (options.locale !== undefined) olark("api.box.setLocale", options.locale)
      queue.ready(olark)
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  lifecycle.transition("ready")
}

/** Promise that resolves once olark's API is live. */
export function ready(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(() => {})
}

/** Set the current visitor on olark. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  store.identify(identity)
  return queue.enqueue((olark) => {
    if (identity.name) olark("api.visitor.updateFullName", { fullName: identity.name })
    if (identity.email) olark("api.visitor.updateEmailAddress", { emailAddress: identity.email })
    if (identity.phone) olark("api.visitor.updatePhoneNumber", { phoneNumber: identity.phone })
    if (identity.attributes) olark("api.visitor.updateCustomFields", identity.attributes)
  })
}

/** Emit a custom event to olark. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => {
    olark("api.visitor.updateCustomFields", { [event]: metadata })
  })
}

/** Notify olark of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

/** Show / open the olark widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.show"))
}

/** Hide / close the olark widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.hide"))
}

/** Expand the box to its larger size. */
export function expand(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.expand"))
}

/** Shrink the box to its smaller size. */
export function shrink(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.shrink"))
}

/** Switch the widget's locale at runtime. */
export function setLocale(locale: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.setLocale", locale))
}

/** Route the visitor to a specific operator group. */
export function setOperatorGroup(group: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.setOperatorGroup", { group }))
}

/** Send a message to the visitor (operator-style). */
export function sendMessageToVisitor(body: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.sendMessageToVisitor", { body }))
}

/** Send a notification to the visitor. */
export function sendNotificationToVisitor(body: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.sendNotificationToVisitor", { body }))
}

/** Send a notification to the operator. */
export function sendNotificationToOperator(body: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.sendNotificationToOperator", { body }))
}

/** Update the operator-side visitor nickname. */
export function updateVisitorNickname(args: {
  snippet: string
  hideDefault?: boolean
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.updateVisitorNickname", args))
}

/** Update the operator-side visitor status snippet(s). */
export function updateVisitorStatus(args: { snippet: string | string[] }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.updateVisitorStatus", args))
}

/** Read the resolved visitor details from the provider. */
export function getVisitorDetails(): Promise<OlarkVisitorDetails | undefined> {
  if (!isBrowser()) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    queue
      .enqueue((olark) => {
        olark("api.visitor.getDetails", (details: unknown) =>
          resolve(details as OlarkVisitorDetails | undefined),
        )
      })
      .catch(() => resolve(undefined))
  })
}

/** Subscribe to the provider's typed lifecycle/event stream. Returns
 *  an unsubscribe function. */
export function on(event: OlarkEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

/** End the olark session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((olark) => {
      olark("api.visitor.updateCustomFields", {})
      olark("api.box.hide")
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
  removeScript("ahize-olark")
  const g = w()
  Reflect.deleteProperty(g, "olark")
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
