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

type GistChatAction =
  | "show"
  | "hide"
  | "open"
  | "close"
  | "shutdown"
  | "showLauncher"
  | "hideLauncher"
  | "sidebar"
  | "standard"

interface GistAPI {
  identify(id: string, traits?: Record<string, unknown>): void
  track?(event: string, props?: Record<string, unknown>): void
  trackEvent?(event: string, props?: Record<string, unknown>): void
  trackPageView?(): void
  chat(action: GistChatAction, ...args: unknown[]): void
  trigger?(...args: unknown[]): void
  shutdown(): void
  on?(event: string, cb: (payload: unknown) => void): void
}

interface GistWindow {
  gist?: GistAPI
  gistAppId?: string
  gistSettings?: Record<string, unknown>
}

function w(): GistWindow {
  return globalThis as unknown as GistWindow
}

const queue = createQueue<GistAPI>()
const store = createIdentityStore()
const lifecycle = createLifecycle()

export type GistEventName =
  | "ready"
  | "chatReady"
  | "messengerOpened"
  | "messengerClosed"
  | "conversationStarted"
  | "conversationOpened"
  | "messageSent"
  | "messageReceived"
  | "emailCaptured"
  | "articleViewed"
  | "articleSearched"
  | "unreadCountChange"

const eventListeners = new Map<GistEventName, Set<(payload?: unknown) => void>>()
const unreadListeners = new Set<(count: number) => void>()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined
let documentReadyHandler: (() => void) | undefined

export interface GistLoadOptions extends LoadOptions {
  appId: string
  /** Hide the floating launcher (pair with customLauncherSelector). */
  hide_default_launcher?: boolean
  /** CSS selector to bind the launcher to a custom DOM element. */
  custom_launcher_selector?: string
}

export async function load(options: GistLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ appId: options.appId })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  await waitForDefer(options.defer ?? "immediate")

  w().gistAppId = options.appId
  const settings: Record<string, unknown> = { ...w().gistSettings }
  if (options.hide_default_launcher !== undefined) {
    settings["hide_default_launcher"] = options.hide_default_launcher
  }
  if (options.custom_launcher_selector !== undefined) {
    settings["custom_launcher_selector"] = options.custom_launcher_selector
  }
  if (Object.keys(settings).length > 0) w().gistSettings = settings

  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  documentReadyHandler = () => {
    const set = eventListeners.get("ready")
    if (set) for (const l of set) l()
    readyResolve?.()
  }
  document.addEventListener("gistReady", documentReadyHandler as (e: Event) => void)

  try {
    await injectScript({
      id: "ahize-gist",
      src: "https://widget.getgist.com",
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const gist = w().gist
    if (gist) {
      queue.ready(gist)
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  lifecycle.transition("ready")
}

export function ready(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return readyPromise ?? Promise.resolve()
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (!identity.id) return Promise.resolve()
  if (identity.verification && identity.verification.kind !== "hmac") {
    return Promise.reject(new Error("Gist requires HMAC verification (kind: 'hmac')"))
  }
  store.identify(identity)
  const id = identity.id
  return queue.enqueue((gist) => {
    const traits: Record<string, unknown> = {
      email: identity.email,
      name: identity.name,
      phone: identity.phone,
      created_at: identity.createdAt,
      ...identity.attributes,
    }
    if (identity.verification?.kind === "hmac") traits["user_hash"] = identity.verification.hash
    gist.identify(id, traits)
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => {
    if (gist.trackEvent) gist.trackEvent(event, metadata)
    else gist.track?.(event, metadata)
  })
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.trackPageView?.())
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  // show + open conflated previously; split via show()/open() so callers pick.
  return queue.enqueue((gist) => gist.chat("show"))
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.chat("hide"))
}

export function open(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.chat("open"))
}

export function close(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.chat("close"))
}

export function showLauncher(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.chat("showLauncher"))
}

export function hideLauncher(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.chat("hideLauncher"))
}

export function setSidebar(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.chat("sidebar"))
}

export function setStandard(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.chat("standard"))
}

export function navigate(
  screen: "home" | "conversations" | "newConversation" | "articles",
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) =>
    (gist.chat as (action: string, ...args: unknown[]) => void)("navigate", screen),
  )
}

export function showArticle(articleId: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) =>
    (gist.chat as (action: string, ...args: unknown[]) => void)("article", articleId),
  )
}

export function trigger(...args: unknown[]): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.trigger?.(...args))
}

export function on(event: GistEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((gist) => gist.chat("shutdown"))
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-gist")
  if (documentReadyHandler) {
    document.removeEventListener("gistReady", documentReadyHandler as () => void)
    documentReadyHandler = undefined
  }
  const g = w()
  Reflect.deleteProperty(g, "gist")
  Reflect.deleteProperty(g, "gistAppId")
  Reflect.deleteProperty(g, "gistSettings")
  queue.reset()
  store.reset()
  eventListeners.clear()
  unreadListeners.clear()
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
