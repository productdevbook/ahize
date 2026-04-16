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

interface TidioAPI {
  setVisitorData(data: {
    distinct_id?: string
    email?: string
    name?: string
    phone?: string
    tags?: string[]
  }): void
  setContactProperties(props: Record<string, unknown>): void
  track?(event: string): void
  setColorPalette?(hex: string): void
  display?(state: boolean): void
  messageFromOperator?(message: string): void
  messageFromVisitor?(message: string): void
  addVisitorTags?(tags: string[]): void
  setVisitorCurrency?(currency: { code: string; exchangeRate?: number }): void
  show(): void
  hide(): void
  open(): void
  close(): void
}

interface TidioIdentity {
  distinct_id?: string
  email?: string
  name?: string
  phone?: string
  tags?: string[]
}

interface TidioWindow {
  tidioChatApi?: TidioAPI
  tidioChatLang?: string
  tidioIdentify?: TidioIdentity
}

function w(): TidioWindow {
  return globalThis as unknown as TidioWindow
}

const queue = createQueue<TidioAPI>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined

const TIDIO_EVENTS = {
  ready: "tidioChat-ready",
  messageFromVisitor: "tidioChat-messageFromVisitor",
  messageFromOperator: "tidioChat-messageFromOperator",
  visitorJoined: "tidioChat-visitorJoined",
  setStatus: "tidioChat-setStatus",
  conversationStart: "tidioChat-conversationStart",
  preFormFilled: "tidioChat-preFormFilled",
  resize: "tidioChat-resize",
  open: "tidioChat-open",
  close: "tidioChat-close",
} as const

export type TidioEventName = keyof typeof TIDIO_EVENTS
const eventListeners = new Map<TidioEventName, Set<(payload: unknown) => void>>()
const domHandlers = new Map<TidioEventName, () => void>()

function bindDomEvent(event: TidioEventName): void {
  if (!isBrowser() || domHandlers.has(event)) return
  const handler = (e: unknown) => {
    const detail = (e as { detail?: unknown } | undefined)?.detail
    const set = eventListeners.get(event)
    if (set) for (const l of set) l(detail)
  }
  document.addEventListener(TIDIO_EVENTS[event], handler)
  domHandlers.set(event, () => document.removeEventListener(TIDIO_EVENTS[event], handler))
}

export interface TidioLoadOptions extends LoadOptions {
  publicKey: string
  /** Pre-load language (writes window.tidioChatLang before script load). */
  language?: string
  /** Pre-load identity (writes window.tidioIdentify before script load). */
  identify?: TidioIdentity
}

export async function load(options: TidioLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ publicKey: options.publicKey })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  await waitForDefer(options.defer ?? "immediate")

  for (const evt of Object.keys(TIDIO_EVENTS) as TidioEventName[]) {
    bindDomEvent(evt)
  }

  document.addEventListener(TIDIO_EVENTS.ready, () => readyResolve?.(), { once: true } as never)

  if (options.language !== undefined) w().tidioChatLang = options.language
  if (options.identify !== undefined) w().tidioIdentify = options.identify

  try {
    await injectScript({
      id: "ahize-tidio",
      src: `//code.tidio.co/${options.publicKey}.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const api = w().tidioChatApi
    if (api) {
      queue.ready(api)
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
  store.identify(identity)
  return queue.enqueue((api) => {
    api.setVisitorData({
      distinct_id: identity.id,
      email: identity.email,
      name: identity.name,
      phone: identity.phone,
    })
    if (identity.attributes) api.setContactProperties(identity.attributes)
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    if (api.track) {
      // Prefer the documented automation-trigger API.
      api.track(event)
      // Tidio's track() doesn't accept metadata; surface it as contact properties
      // so it isn't lost.
      if (metadata) api.setContactProperties({ [`${event}_metadata`]: metadata })
    } else {
      api.setContactProperties({ [event]: metadata })
    }
  })
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

export function setColorPalette(hex: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.setColorPalette?.(hex))
}

export function display(state: boolean): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.display?.(state))
}

export function messageFromOperator(message: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.messageFromOperator?.(message))
}

export function messageFromVisitor(message: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.messageFromVisitor?.(message))
}

export function addVisitorTags(tags: string[]): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.addVisitorTags?.(tags))
}

export function setVisitorCurrency(currency: {
  code: string
  exchangeRate?: number
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.setVisitorCurrency?.(currency))
}

export function on(event: TidioEventName, listener: (payload: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.show())
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.hide())
}

export function open(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.open())
}

export function close(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => api.close())
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  store.reset()
  lifecycle.transition("shutdown")
  return Promise.resolve()
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  for (const off of domHandlers.values()) off()
  domHandlers.clear()
  eventListeners.clear()
  removeScript("ahize-tidio")
  const g = w()
  Reflect.deleteProperty(g, "tidioChatApi")
  Reflect.deleteProperty(g, "tidioChatLang")
  Reflect.deleteProperty(g, "tidioIdentify")
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
