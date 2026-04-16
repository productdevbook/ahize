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

export type BeaconMode = "selfService" | "neutral" | "askFirst"

export interface BeaconDisplayConfig {
  style?: "icon" | "text" | "iconAndText"
  text?: string
  position?: "left" | "right"
  zIndex?: number
  horizontalOffset?: number | string
  verticalOffset?: number | string
}

export interface BeaconMessagingConfig {
  chatEnabled?: boolean
  contactForm?: {
    customFieldsEnabled?: boolean
    showName?: boolean
    showSubject?: boolean
    allowAttachments?: boolean
  }
}

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

export interface HelpScoutLoadOptions extends LoadOptions {
  beaconId: string
  /** Optional Beacon `init` config object (display, color, mode, labels, etc.). */
  config?: BeaconConfig
}

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

export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

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

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => {
    Beacon("event", { type: event, url: location.href, ...metadata })
  })
}

export function pageView(info?: { path?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  const url = info?.path ?? location.href
  return queue.enqueue((Beacon) => Beacon("event", { type: "page-viewed", url }))
}

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

export type BeaconRoute =
  | "/ask/"
  | "/ask/message/"
  | "/ask/chat/"
  | "/answers/"
  | "/ai-answers/"
  | "/previous-messages/"
  | (string & {})

export function navigate(path: BeaconRoute): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("navigate", path))
}

export function search(query: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("search", query))
}

export function article(
  articleId: string,
  options?: { type?: "sidebar" | "modal" },
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) =>
    options ? Beacon("article", articleId, options) : Beacon("article", articleId),
  )
}

export function sessionData(data: Record<string, string>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("session-data", data))
}

export function config(next: BeaconConfig): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("config", next))
}

export function reset(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("reset"))
}

export function toggle(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("toggle"))
}

export function askQuestion(question: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("ask-question", question))
}

export function showMessage(
  id: string,
  options?: { delay?: number; force?: boolean },
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) =>
    options ? Beacon("show-message", id, options) : Beacon("show-message", id),
  )
}

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

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("open"))
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("close"))
}

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
