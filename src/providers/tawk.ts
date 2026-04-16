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

interface TawkVisitor {
  name?: string
  email?: string
  hash?: string
}

interface TawkAPI {
  visitor?: TawkVisitor
  setAttributes?: (attrs: Record<string, unknown>, cb?: (err?: Error) => void) => void
  addEvent?: (event: string, metadata?: Record<string, unknown>, cb?: (err?: Error) => void) => void
  showWidget?: () => void
  hideWidget?: () => void
  maximize?: () => void
  minimize?: () => void
  toggle?: () => void
  popup?: () => void
  endChat?: () => void
  login?: (user: TawkVisitor, cb?: (err?: Error) => void) => void
  logout?: (cb?: (err?: Error) => void) => void
  switchWidget?: (options: { propertyId: string; widgetId: string }) => void
  // Event hooks Tawk exposes; each must be assignable.
  onLoad?: () => void
  onStatusChange?: (status: "online" | "away" | "offline") => void
  onChatMaximized?: () => void
  onChatMinimized?: () => void
  onChatHidden?: () => void
  onChatStarted?: () => void
  onChatEnded?: () => void
  onChatMessageVisitor?: (message: string) => void
  onChatMessageAgent?: (message: string) => void
  onChatMessageSystem?: (message: string) => void
  onAgentJoinChat?: (agent: { name: string; id: string }) => void
  onAgentLeaveChat?: (agent: { name: string; id: string }) => void
  onChatSatisfaction?: (satisfaction: -1 | 0 | 1) => void
  onVisitorNameChanged?: (name: string) => void
  onFileUpload?: (url: string) => void
  onTagsUpdated?: (data: unknown) => void
  onUnreadCountChanged?: (count: number) => void
}

interface TawkWindow {
  Tawk_API?: TawkAPI
  Tawk_LoadStart?: Date
}

function w(): TawkWindow {
  return globalThis as unknown as TawkWindow
}

function api(): TawkAPI {
  const g = w()
  if (!g.Tawk_API) g.Tawk_API = {}
  return g.Tawk_API
}

const queue = createQueue<TawkAPI>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
const unreadListeners = new Set<(count: number) => void>()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined

const TAWK_COLLISION_SYMBOLS = ["L", "R", "T"]

function warnCollisions(): void {
  if (!isBrowser()) return
  const g = globalThis as unknown as Record<string, unknown>
  for (const s of TAWK_COLLISION_SYMBOLS) {
    if (g[s] !== undefined) {
      console.warn(
        `[ahize/tawk] window.${s} is already defined (maybe Leaflet/Ramda?); Tawk's CDN clobbers single-letter globals. Save/restore manually.`,
      )
    }
  }
}

export interface TawkLoadOptions extends LoadOptions {
  propertyId: string
  widgetId?: string
}

export async function load(options: TawkLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ propertyId: options.propertyId, widgetId: options.widgetId })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  warnCollisions()
  await waitForDefer(options.defer ?? "immediate")
  const a = api()
  w().Tawk_LoadStart = new Date()
  a.onLoad = () => {
    queue.ready(a)
    readyResolve?.()
  }
  a.onUnreadCountChanged = (count: number) => {
    for (const l of unreadListeners) l(count)
  }

  const widget = options.widgetId ?? "default"
  try {
    await injectScript({
      id: "ahize-tawk",
      src: `https://embed.tawk.to/${options.propertyId}/${widget}`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }
  lifecycle.transition("ready")
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (identity.verification && identity.verification.kind !== "hmac") {
    return Promise.reject(new Error("Tawk requires HMAC verification (kind: 'hmac')"))
  }
  store.identify(identity)
  return queue.enqueue((a) => {
    const attrs: Record<string, unknown> = {}
    if (identity.name) attrs["name"] = identity.name
    if (identity.email) attrs["email"] = identity.email
    if (identity.verification?.kind === "hmac") attrs["hash"] = identity.verification.hash
    if (identity.attributes) Object.assign(attrs, identity.attributes)
    a.setAttributes?.(attrs, (err) => {
      if (err) console.warn("[ahize/tawk] setAttributes failed", err)
    })
  })
}

export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => {
    const attrs: Record<string, unknown> = {}
    if (info?.path) attrs["path"] = info.path
    if (info?.locale) attrs["locale"] = info.locale
    if (Object.keys(attrs).length > 0) a.setAttributes?.(attrs)
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => {
    a.addEvent?.(event, metadata)
  })
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => {
    a.showWidget?.()
  })
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => {
    a.hideWidget?.()
  })
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((a) => {
      a.endChat?.()
    })
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

export function switchWidget(options: { propertyId: string; widgetId: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => {
    a.switchWidget?.({ propertyId: options.propertyId, widgetId: options.widgetId })
  })
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-tawk")
  const g = w()
  Reflect.deleteProperty(g, "Tawk_API")
  Reflect.deleteProperty(g, "Tawk_LoadStart")
  queue.reset()
  store.reset()
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
