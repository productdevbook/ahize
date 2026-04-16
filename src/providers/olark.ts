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

type OlarkFn = (method: string, ...args: unknown[]) => void

interface OlarkWindow {
  olark?: OlarkFn
}

function w(): OlarkWindow {
  return globalThis as unknown as OlarkWindow
}

const queue = createQueue<OlarkFn>()
const store = createIdentityStore()
const lifecycle = createLifecycle()

export interface OlarkLoadOptions extends LoadOptions {
  siteId: string
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
