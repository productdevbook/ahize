/**
 * @deprecated The Userlike v1 CDN bundle (`userlike-cdn-widgets.s3-eu-west-1...`)
 * loaded by this wrapper reaches EOL on 2026-08-01. Userlike has rebranded to
 * Lime Connect; the v2 SDK (`@userlike/messenger`, `createMessenger({ version: 2 })`)
 * has a different surface and is the recommended migration target.
 * See https://github.com/productdevbook/ahize/issues/95 for migration notes.
 */
import { waitForDefer } from "../_defer.ts"
import { createIdentityStore } from "../_identity.ts"
import { createLifecycle, hashConfig } from "../_lifecycle.ts"
import { injectScript, isBrowser, removeScript } from "../_loader.ts"
import { createQueue } from "../_queue.ts"
import { ProviderNotLoadedError } from "../errors.ts"
import type {
  EventMetadata,
  Identity,
  IdentityListener,
  IdentityState,
  LoadOptions,
} from "../_types.ts"

type UserlikeResult<T = unknown> = { ok: true; value: T } | { ok: false; error: string }

interface UserlikeMessenger {
  mount(): Promise<UserlikeResult>
  api: {
    setContactInfo(info: Record<string, unknown>): Promise<UserlikeResult>
    setCustomData(data: Record<string, unknown>): Promise<UserlikeResult>
    setVisibility(v: {
      button?: boolean
      notifications?: boolean
      unread?: boolean
    }): Promise<UserlikeResult>
    setLocale(locale: string): Promise<UserlikeResult>
    open(): Promise<UserlikeResult>
    close(): Promise<UserlikeResult>
  }
}

interface UserlikeWindow {
  userlikeMessenger?: UserlikeMessenger
}

function w(): UserlikeWindow {
  return globalThis as unknown as UserlikeWindow
}

const queue = createQueue<UserlikeMessenger>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
let sunsetWarned = false

function unwrap<T>(r: UserlikeResult<T>): T {
  if (!r.ok) throw new ProviderNotLoadedError(`Userlike error: ${r.error}`)
  return r.value
}

export interface UserlikeLoadOptions extends LoadOptions {
  messengerId: string
}

export async function load(options: UserlikeLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  if (!sunsetWarned) {
    sunsetWarned = true
    console.warn(
      "[ahize/userlike] Userlike v1 CDN reaches EOL on 2026-08-01. " +
        "Vendor rebranded to Lime Connect; migrate to @userlike/messenger v2. " +
        "See https://github.com/productdevbook/ahize/issues/95",
    )
  }
  const h = hashConfig({ messengerId: options.messengerId })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  await waitForDefer(options.defer ?? "immediate")

  try {
    await injectScript({
      id: "ahize-userlike",
      src: `https://userlike-cdn-widgets.s3-eu-west-1.amazonaws.com/${options.messengerId}.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const m = w().userlikeMessenger
    if (m) {
      await m.mount()
      queue.ready(m)
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
  return queue.enqueue(async (m) => {
    unwrap(
      await m.api.setContactInfo({
        name: identity.name,
        email: identity.email,
        phone: identity.phone,
      }),
    )
    if (identity.attributes) unwrap(await m.api.setCustomData(identity.attributes))
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(async (m) => {
    unwrap(await m.api.setCustomData({ [event]: metadata }))
  })
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

export function setLocale(locale: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(async (m) => {
    unwrap(await m.api.setLocale(locale))
  })
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(async (m) => {
    unwrap(await m.api.setVisibility({ button: true }))
    unwrap(await m.api.open())
  })
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(async (m) => {
    unwrap(await m.api.setVisibility({ button: false }))
  })
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue(async (m) => {
      unwrap(await m.api.close())
    })
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-userlike")
  const g = w()
  Reflect.deleteProperty(g, "userlikeMessenger")
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
