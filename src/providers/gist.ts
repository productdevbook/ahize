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

interface GistAPI {
  identify(id: string, traits?: Record<string, unknown>): void
  track(event: string, props?: Record<string, unknown>): void
  chat(action: "show" | "hide" | "open" | "close"): void
  shutdown(): void
  on?(event: string, cb: (payload: unknown) => void): void
}

interface GistWindow {
  gist?: GistAPI
  gistAppId?: string
}

function w(): GistWindow {
  return globalThis as unknown as GistWindow
}

const queue = createQueue<GistAPI>()
const store = createIdentityStore()
const lifecycle = createLifecycle()

export interface GistLoadOptions extends LoadOptions {
  appId: string
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
  return queue.enqueue(() => {})
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
  return queue.enqueue((gist) => gist.track(event, metadata))
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => {
    gist.chat("show")
    gist.chat("open")
  })
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((gist) => gist.chat("hide"))
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((gist) => gist.shutdown())
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-gist")
  const g = w()
  Reflect.deleteProperty(g, "gist")
  Reflect.deleteProperty(g, "gistAppId")
  queue.reset()
  store.reset()
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
