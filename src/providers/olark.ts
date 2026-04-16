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

export interface OlarkLoadOptions extends LoadOptions {
  siteId: string
  /** Initial agent group routing. */
  group?: string
  /** Initial widget locale. */
  locale?: string
}

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

export function ready(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(() => {})
}

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

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => {
    olark("api.visitor.updateCustomFields", { [event]: metadata })
  })
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.show"))
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.hide"))
}

export function expand(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.expand"))
}

export function shrink(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.shrink"))
}

export function setLocale(locale: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.box.setLocale", locale))
}

export function setOperatorGroup(group: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.setOperatorGroup", { group }))
}

export function sendMessageToVisitor(body: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.sendMessageToVisitor", { body }))
}

export function sendNotificationToVisitor(body: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.sendNotificationToVisitor", { body }))
}

export function sendNotificationToOperator(body: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.sendNotificationToOperator", { body }))
}

export function updateVisitorNickname(args: {
  snippet: string
  hideDefault?: boolean
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.updateVisitorNickname", args))
}

export function updateVisitorStatus(args: { snippet: string | string[] }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((olark) => olark("api.chat.updateVisitorStatus", args))
}

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

export function on(event: OlarkEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

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
