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
  phone?: string
  userId?: string
}

interface TawkCustomStyle {
  zIndex?: number | string
}

interface TawkAPI {
  visitor?: TawkVisitor
  customStyle?: TawkCustomStyle
  autoStart?: boolean
  setAttributes?: (attrs: Record<string, unknown>, cb?: (err?: Error) => void) => void
  addEvent?: (event: string, metadata?: Record<string, unknown>, cb?: (err?: Error) => void) => void
  addTags?: (tags: string[], cb?: (err?: Error) => void) => void
  removeTags?: (tags: string[], cb?: (err?: Error) => void) => void
  showWidget?: () => void
  hideWidget?: () => void
  toggleVisibility?: () => void
  maximize?: () => void
  minimize?: () => void
  toggle?: () => void
  popup?: () => void
  endChat?: () => void
  start?: (options?: { showWidget?: boolean }) => void
  getStatus?: () => "online" | "away" | "offline"
  getWindowType?: () => "inline" | "embed"
  isChatMaximized?: () => boolean
  isChatMinimized?: () => boolean
  isChatHidden?: () => boolean
  isChatOngoing?: () => boolean
  isVisitorEngaged?: () => boolean
  login?: (user: TawkVisitor, cb?: (err?: Error) => void) => void
  logout?: (cb?: (err?: Error) => void) => void
  switchWidget?: (
    options: { propertyId: string; widgetId: string },
    cb?: (err?: Error) => void,
  ) => void
  // Event hooks Tawk exposes; each must be assignable.
  onBeforeLoad?: () => void
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
  onPrechatSubmit?: (data: unknown) => void
  onOfflineSubmit?: (data: unknown) => void
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
const eventListeners = new Map<string, Set<(payload?: unknown) => void>>()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined

const HOOK_TO_EVENT: Record<string, string> = {
  onBeforeLoad: "beforeLoad",
  onLoad: "load",
  onStatusChange: "statusChange",
  onChatMaximized: "chatMaximized",
  onChatMinimized: "chatMinimized",
  onChatHidden: "chatHidden",
  onChatStarted: "chatStarted",
  onChatEnded: "chatEnded",
  onChatMessageVisitor: "chatMessageVisitor",
  onChatMessageAgent: "chatMessageAgent",
  onChatMessageSystem: "chatMessageSystem",
  onAgentJoinChat: "agentJoinChat",
  onAgentLeaveChat: "agentLeaveChat",
  onChatSatisfaction: "chatSatisfaction",
  onVisitorNameChanged: "visitorNameChanged",
  onFileUpload: "fileUpload",
  onTagsUpdated: "tagsUpdated",
  onPrechatSubmit: "prechatSubmit",
  onOfflineSubmit: "offlineSubmit",
}

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

export type TawkEventName =
  | "beforeLoad"
  | "load"
  | "statusChange"
  | "chatMaximized"
  | "chatMinimized"
  | "chatHidden"
  | "chatStarted"
  | "chatEnded"
  | "chatMessageVisitor"
  | "chatMessageAgent"
  | "chatMessageSystem"
  | "agentJoinChat"
  | "agentLeaveChat"
  | "chatSatisfaction"
  | "visitorNameChanged"
  | "fileUpload"
  | "tagsUpdated"
  | "prechatSubmit"
  | "offlineSubmit"

export interface TawkLoadOptions extends LoadOptions {
  propertyId: string
  widgetId?: string
  /** Visitor preload — must be assigned before the embed script downloads. */
  visitor?: { name?: string; email?: string; hash?: string; phone?: string; userId?: string }
  /** Tawk's only documented customStyle field. */
  customStyleZIndex?: number | string
  /** When false, defers the socket connection until start() is called. Default: true. */
  autoStart?: boolean
  /** Pre-load hook fired before the embed script downloads. */
  onBeforeLoad?: () => void
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
  if (options.visitor) a.visitor = { ...options.visitor }
  if (options.customStyleZIndex !== undefined) {
    a.customStyle = { ...a.customStyle, zIndex: options.customStyleZIndex }
  }
  if (options.autoStart === false) a.autoStart = false
  // If the caller passed onBeforeLoad as a load option, register it through
  // the same emitter so the bridge below doesn't clobber it.
  if (options.onBeforeLoad) {
    let set = eventListeners.get("beforeLoad")
    if (!set) {
      set = new Set()
      eventListeners.set("beforeLoad", set)
    }
    set.add(options.onBeforeLoad)
  }
  // Wire every documented Tawk hook to our typed emitter (multi-listener bridge).
  for (const [hook, eventName] of Object.entries(HOOK_TO_EVENT)) {
    ;(a as unknown as Record<string, (payload?: unknown) => void>)[hook] = (payload) => {
      const set = eventListeners.get(eventName)
      if (set) for (const l of set) l(payload)
      if (eventName === "load") {
        queue.ready(a)
        readyResolve?.()
      }
    }
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
    if (identity.phone) attrs["phone"] = identity.phone
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

export function switchWidget(
  options: { propertyId: string; widgetId: string },
  cb?: (err?: Error) => void,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => {
    a.switchWidget?.({ propertyId: options.propertyId, widgetId: options.widgetId }, cb)
  })
}

function callMethod(name: keyof TawkAPI, ...args: unknown[]): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => {
    const fn = a[name] as ((...rest: unknown[]) => unknown) | undefined
    fn?.(...args)
  })
}

export function maximize(): Promise<void> {
  return callMethod("maximize")
}

export function minimize(): Promise<void> {
  return callMethod("minimize")
}

export function toggle(): Promise<void> {
  return callMethod("toggle")
}

export function popup(): Promise<void> {
  return callMethod("popup")
}

export function toggleVisibility(): Promise<void> {
  return callMethod("toggleVisibility")
}

export function endChat(): Promise<void> {
  return callMethod("endChat")
}

export function start(options?: { showWidget?: boolean }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => a.start?.(options))
}

export function addTags(tags: string[], cb?: (err?: Error) => void): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => a.addTags?.(tags, cb))
}

export function removeTags(tags: string[], cb?: (err?: Error) => void): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((a) => a.removeTags?.(tags, cb))
}

export function login(
  user: { name?: string; email?: string; phone?: string; hash?: string; userId?: string },
  cb?: (err?: Error) => void,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  store.identify({
    id: user.userId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    ...(user.hash ? { verification: { kind: "hmac" as const, hash: user.hash } } : {}),
  })
  return queue.enqueue((a) => a.login?.(user, cb))
}

export function logout(cb?: (err?: Error) => void): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  store.reset()
  return queue.enqueue((a) => a.logout?.(cb))
}

function syncRead<T>(name: keyof TawkAPI): T | undefined {
  if (!isBrowser()) return undefined
  const fn = w().Tawk_API?.[name] as (() => T) | undefined
  return fn?.()
}

export function getStatus(): "online" | "away" | "offline" | undefined {
  return syncRead<"online" | "away" | "offline">("getStatus")
}

export function getWindowType(): "inline" | "embed" | undefined {
  return syncRead<"inline" | "embed">("getWindowType")
}

export function isChatMaximized(): boolean | undefined {
  return syncRead<boolean>("isChatMaximized")
}

export function isChatMinimized(): boolean | undefined {
  return syncRead<boolean>("isChatMinimized")
}

export function isChatHidden(): boolean | undefined {
  return syncRead<boolean>("isChatHidden")
}

export function isChatOngoing(): boolean | undefined {
  return syncRead<boolean>("isChatOngoing")
}

export function isVisitorEngaged(): boolean | undefined {
  return syncRead<boolean>("isVisitorEngaged")
}

export function on(event: TawkEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
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
