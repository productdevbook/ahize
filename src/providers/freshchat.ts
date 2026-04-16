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

interface FreshchatUser {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  externalId?: string
}

interface FreshchatWidget {
  init(opts: { token: string; host: string; externalId?: string; restoreId?: string }): void
  user: {
    setProperties(props: Record<string, unknown>): void
    update(user: FreshchatUser): void
    clear(): void
    setEmail(email: string): void
    setFirstName(name: string): void
    setLastName(name: string): void
    setPhone(phone: string): void
  }
  setExternalId(id: string): void
  setJWTAuthToken(token: string): void
  track?: (event: string, props?: Record<string, unknown>) => void
  show(): void
  hide(): void
  open(opts?: { name?: string }): void
  close(): void
  destroy(): void
  on(event: string, cb: (payload: unknown) => void): void
  off(event: string, cb: (payload: unknown) => void): void
  isInitialized(): boolean
}

interface FreshchatWindow {
  fcWidget?: FreshchatWidget
  fcSettings?: Record<string, unknown>
}

function w(): FreshchatWindow {
  return globalThis as unknown as FreshchatWindow
}

const queue = createQueue<FreshchatWidget>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined
let currentToken: string | undefined
let currentHost: string | undefined

export interface FreshchatLoadOptions extends LoadOptions {
  token: string
  /** e.g. wchat.freshchat.com (default) or wchat.eu.freshchat.com */
  host?: string
  externalId?: string
  restoreId?: string
}

export async function load(options: FreshchatLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const host = options.host ?? "https://wchat.freshchat.com"
  const h = hashConfig({ token: options.token, host })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  currentToken = options.token
  currentHost = host
  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  await waitForDefer(options.defer ?? "immediate")

  try {
    await injectScript({
      id: "ahize-freshchat",
      src: `${host}/js/widget.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const widget = w().fcWidget
    if (widget) {
      widget.init({
        token: options.token,
        host,
        externalId: options.externalId,
        restoreId: options.restoreId,
      })
      queue.ready(widget)
      widget.on("widget:loaded", () => readyResolve?.())
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
  if (identity.verification && identity.verification.kind !== "jwt") {
    return Promise.reject(new Error("Freshchat requires JWT verification (kind: 'jwt')"))
  }
  store.identify(identity)
  return queue.enqueue((widget) => {
    if (identity.verification?.kind === "jwt") widget.setJWTAuthToken(identity.verification.token)
    if (identity.id) widget.setExternalId(identity.id)
    const [first, ...rest] = (identity.name ?? "").split(" ")
    widget.user.update({
      email: identity.email,
      phone: identity.phone,
      firstName: first || undefined,
      lastName: rest.join(" ") || undefined,
      externalId: identity.id,
    })
    if (identity.attributes) widget.user.setProperties(identity.attributes)
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.track?.(event, metadata))
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.open())
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.close())
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((widget) => {
      widget.user.clear()
      widget.destroy()
    })
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-freshchat")
  const g = w()
  Reflect.deleteProperty(g, "fcWidget")
  Reflect.deleteProperty(g, "fcSettings")
  queue.reset()
  store.reset()
  currentToken = undefined
  currentHost = undefined
  readyPromise = undefined
  readyResolve = undefined
  lifecycle.clearConfigHash()
  lifecycle.transition("idle")
}

export function getConfig(): { token?: string; host?: string } {
  return { token: currentToken, host: currentHost }
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
