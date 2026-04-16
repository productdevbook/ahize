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

export interface HelpScoutLoadOptions extends LoadOptions {
  beaconId: string
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
      beacon("init", options.beaconId)
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

export function navigate(path: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("navigate", path))
}

export function prefill(payload: {
  name?: string
  email?: string
  subject?: string
  text?: string
  fields?: Array<{ id: number; value: string }>
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("prefill", payload))
}

export function on(
  event:
    | "ready"
    | "open"
    | "close"
    | "article-viewed"
    | "email-sent"
    | "chat-started"
    | "chat-ended",
  listener: (payload: unknown) => void,
): () => void {
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

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("open"))
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Beacon) => Beacon("close"))
}

export function shutdown(opts?: { endActiveChat?: boolean }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  const endActiveChat = opts?.endActiveChat ?? true
  return queue
    .enqueue((Beacon) => Beacon("logout", { endActiveChat }))
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
