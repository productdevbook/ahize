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

type SmartsuppFn = (cmd: string, ...args: unknown[]) => void

interface SmartsuppWindow {
  smartsupp?: SmartsuppFn
  _smartsupp?: { key?: string; hideWidget?: boolean; [k: string]: unknown }
}

function w(): SmartsuppWindow {
  return globalThis as unknown as SmartsuppWindow
}

const queue = createQueue<SmartsuppFn>()
const store = createIdentityStore()
const lifecycle = createLifecycle()

export interface SmartsuppLoadOptions extends LoadOptions {
  key: string
  /** Initial widget visibility (config-time). Use show()/hide() at runtime. */
  hideWidget?: boolean
}

export async function load(options: SmartsuppLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ key: options.key })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  await waitForDefer(options.defer ?? "immediate")

  w()._smartsupp = { key: options.key, hideWidget: options.hideWidget }

  try {
    await injectScript({
      id: "ahize-smartsupp",
      src: "https://www.smartsuppchat.com/loader.js",
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const fn = w().smartsupp
    if (typeof fn === "function") {
      queue.ready(fn)
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
  return queue.enqueue((s) => {
    if (identity.name) s("name", identity.name)
    if (identity.email) s("email", identity.email)
    if (identity.phone) s("phone", identity.phone)
    if (identity.attributes) s("variables", identity.attributes)
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("variables", { [event]: metadata }))
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  // Clear config-time hide flag too, otherwise the snippet immediately hides again.
  const settings = w()._smartsupp
  if (settings) settings.hideWidget = false
  return queue.enqueue((s) => s("chat:show"))
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((s) => s("chat:hide"))
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((s) => s("logout"))
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-smartsupp")
  const g = w()
  Reflect.deleteProperty(g, "smartsupp")
  Reflect.deleteProperty(g, "_smartsupp")
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
