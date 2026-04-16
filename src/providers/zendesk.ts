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

type ZendeskFn = (api: string, command: string, ...args: unknown[]) => unknown

interface ZendeskWindow {
  zE?: ZendeskFn
  zESettings?: Record<string, unknown>
}

function w(): ZendeskWindow {
  return globalThis as unknown as ZendeskWindow
}

const queue = createQueue<ZendeskFn>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
const unreadListeners = new Set<(count: number) => void>()
type ZendeskEventName =
  | "open"
  | "close"
  | "unreadMessages"
  | "conversationStarted"
  | "conversationOpened"
  | "proactiveMessageDisplayed"
  | "proactiveMessageClicked"
  | "newConversationButtonClicked"
  | "conversationWithAgentRequested"
  | "conversationAgentAssigned"
  | "messagesShown"
  | "postbackButtonClicked"
  | "conversationExtensionOpened"
  | "conversationExtensionDisplayed"
const eventListeners = new Map<ZendeskEventName, Set<(payload?: unknown) => void>>()
const ZENDESK_EVENTS: readonly ZendeskEventName[] = [
  "open",
  "close",
  "conversationStarted",
  "conversationOpened",
  "proactiveMessageDisplayed",
  "proactiveMessageClicked",
  "newConversationButtonClicked",
  "conversationWithAgentRequested",
  "conversationAgentAssigned",
  "messagesShown",
  "postbackButtonClicked",
  "conversationExtensionOpened",
  "conversationExtensionDisplayed",
]
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined

export type ZendeskCookieMode = "all" | "functional" | "none"

export interface ZendeskCustomization {
  color?: { primary?: string; launcher?: string; launcherText?: string; messageBubble?: string }
  position?: { horizontal?: "left" | "right"; vertical?: "bottom" | "top" }
  hideAvatars?: boolean
  hideOfflineForm?: boolean
  // Forward anything not yet typed.
  [key: string]: unknown
}

export interface ZendeskLoadOptions extends LoadOptions {
  key: string
  /** Cookie consent mode (defaults to vendor's `all`). */
  cookies?: ZendeskCookieMode
  /** Messenger z-index. */
  zIndex?: number
  /** Initial customization (colors, position, etc.). */
  customization?: ZendeskCustomization
}

export async function load(options: ZendeskLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ key: options.key })
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
      id: "ze-snippet",
      src: `https://static.zdassets.com/ekr/snippet.js?key=${options.key}`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  const fn = w().zE
  if (typeof fn === "function") {
    queue.ready(fn)
    fn("messenger:on", "unreadMessages", (count: number) => {
      for (const l of unreadListeners) l(count)
    })
    for (const evt of ZENDESK_EVENTS) {
      fn("messenger:on", evt, (payload: unknown) => {
        const set = eventListeners.get(evt)
        if (!set) return
        for (const l of set) l(payload)
      })
    }
    if (options.cookies !== undefined) fn("messenger:set", "cookies", options.cookies)
    if (options.zIndex !== undefined) fn("messenger:set", "zIndex", options.zIndex)
    if (options.customization !== undefined) {
      fn("messenger:set", "customization", options.customization)
    }
  }
  lifecycle.transition("ready")
  readyResolve?.()
}

export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

const loginErrorListeners = new Set<(err: unknown) => void>()

export function onLoginError(listener: (err: unknown) => void): () => void {
  loginErrorListeners.add(listener)
  return () => loginErrorListeners.delete(listener)
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (!identity.verification) {
    return Promise.reject(
      new Error("Zendesk Messenger requires verification (kind: 'jwt' or 'callback')"),
    )
  }
  if (identity.verification.kind !== "jwt" && identity.verification.kind !== "callback") {
    return Promise.reject(
      new Error("Zendesk Messenger requires verification (kind: 'jwt' or 'callback')"),
    )
  }
  store.identify(identity)
  const verification = identity.verification
  return queue.enqueue((zE) => {
    zE(
      "messenger",
      "loginUser",
      (callback: unknown) => {
        const deliver = callback as (jwt: string) => void
        if (verification.kind === "jwt") {
          deliver(verification.token)
        } else {
          Promise.resolve(verification.getToken())
            .then(deliver)
            .catch((err) => {
              for (const l of loginErrorListeners) l(err)
            })
        }
      },
      (err: unknown) => {
        console.warn("[ahize/zendesk] loginUser failed", err)
        for (const l of loginErrorListeners) l(err)
      },
    )
  })
}

export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => {
    if (info?.locale) zE("messenger:set", "locale", info.locale)
    // NOTE: Zendesk's conversationFields requires numeric custom-field IDs.
    // path is intentionally not auto-attached — callers should use track() with
    // their own numeric field id, or set cookies/customization at load time.
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => {
    // The documented command is messenger:set, not messenger.
    zE("messenger:set", "conversationFields", [{ id: event, value: metadata }])
  })
}

export function setConversationTags(tags: string[]): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger:set", "conversationTags", tags))
}

export function setLocale(locale: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger:set", "locale", locale))
}

export function setCookies(mode: ZendeskCookieMode): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger:set", "cookies", mode))
}

export function setZIndex(z: number): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger:set", "zIndex", z))
}

export function setCustomization(customization: ZendeskCustomization): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger:set", "customization", customization))
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger", "show"))
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger", "hide"))
}

export function open(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger", "open"))
}

export function close(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger", "close"))
}

export function newConversation(options?: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) =>
    options
      ? zE("messenger:ui", "newConversation", options)
      : zE("messenger:ui", "newConversation"),
  )
}

export function resetWidget(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("messenger", "resetWidget"))
}

export function on(event: ZendeskEventName, listener: (payload?: unknown) => void): () => void {
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
    .enqueue((zE) => {
      zE("messenger", "logoutUser")
    })
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ze-snippet")
  const g = w()
  Reflect.deleteProperty(g, "zE")
  Reflect.deleteProperty(g, "zESettings")
  queue.reset()
  store.reset()
  unreadListeners.clear()
  loginErrorListeners.clear()
  eventListeners.clear()
  readyPromise = undefined
  readyResolve = undefined
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
