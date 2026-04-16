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

type IntercomFn = (command: string, ...args: unknown[]) => void

interface IntercomWindow {
  Intercom?: IntercomFn
  intercomSettings?: Record<string, unknown>
}

function w(): IntercomWindow {
  return globalThis as unknown as IntercomWindow
}

interface StubIntercom extends IntercomFn {
  q?: unknown[]
  c?: (args: unknown[]) => void
}

function ensureStub(): StubIntercom {
  const g = w()
  const existing = g.Intercom as StubIntercom | undefined
  if (existing) return existing
  const stub = function (...args: unknown[]) {
    stub.c?.(args)
  } as StubIntercom
  stub.q = []
  stub.c = (args) => stub.q?.push(args)
  g.Intercom = stub
  return stub
}

const queue = createQueue<IntercomFn>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
const unreadListeners = new Set<(count: number) => void>()
let currentAppId: string | undefined
let currentOptions: IntercomLoadOptions | undefined
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined
let unreadBound = false

export type IntercomRegion = "us" | "eu" | "au"

export interface IntercomLoadOptions extends LoadOptions {
  appId: string
  region?: IntercomRegion
  /** When false, load() returns immediately without injecting. Default: true. */
  enabled?: boolean
}

function apiBaseFor(region?: IntercomRegion): string | undefined {
  if (region === "eu") return "https://api-iam.eu.intercom.io"
  if (region === "au") return "https://api-iam.au.intercom.io"
  return undefined
}

export async function load(options: IntercomLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  if (options.enabled === false) return
  const configHash = hashConfig({ appId: options.appId, region: options.region })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === configHash) return
  if (lifecycle.state() === "loading") return
  if (lifecycle.configHash() && lifecycle.configHash() !== configHash) {
    await destroy()
  }

  lifecycle.transition("loading")
  currentAppId = options.appId
  currentOptions = options
  readyPromise = new Promise((resolve) => {
    readyResolve = resolve
  })
  lifecycle.setConfigHash(configHash)
  await waitForDefer(options.defer ?? "immediate")
  const apiBase = apiBaseFor(options.region)
  w().intercomSettings = {
    app_id: options.appId,
    ...(apiBase ? { api_base: apiBase } : {}),
  }
  const stub = ensureStub()
  stub("boot", {
    app_id: options.appId,
    ...(apiBase ? { api_base: apiBase } : {}),
  })

  try {
    await injectScript({
      id: "ahize-intercom",
      src: `https://widget.intercom.io/widget/${options.appId}`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  const fn = w().Intercom
  if (typeof fn === "function") {
    queue.ready(fn)
    if (!unreadBound) {
      fn("onUnreadCountChange", (count: number) => {
        for (const l of unreadListeners) l(count)
      })
      unreadBound = true
    }
  }
  lifecycle.transition("ready")
  readyResolve?.()
}

export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

export function onUnreadCountChange(listener: (count: number) => void): () => void {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

export async function softReboot(): Promise<void> {
  if (!isBrowser() || !currentOptions) return
  const opts = currentOptions
  await shutdown()
  await load(opts)
}

export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (
    identity.verification &&
    identity.verification.kind !== "hmac" &&
    identity.verification.kind !== "jwt"
  ) {
    return Promise.reject(
      new Error("Intercom requires HMAC (user_hash) or JWT (intercom_user_jwt) verification"),
    )
  }
  store.identify(identity)
  const v = identity.verification
  return queue.enqueue((Intercom) => {
    Intercom("update", {
      app_id: currentAppId,
      user_id: identity.id,
      email: identity.email,
      name: identity.name,
      phone: identity.phone,
      created_at: identity.createdAt,
      user_hash: v?.kind === "hmac" ? v.hash : undefined,
      intercom_user_jwt: v?.kind === "jwt" ? v.token : undefined,
      ...identity.attributes,
    })
  })
}

export function pageView(info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Intercom) => {
    Intercom("update", {
      last_request_at: Math.floor(Date.now() / 1000),
      ...(info?.path ? { current_page: info.path } : {}),
      ...(info?.locale ? { language_override: info.locale } : {}),
    })
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Intercom) => {
    Intercom("trackEvent", event, metadata)
  })
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Intercom) => {
    Intercom("show")
  })
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Intercom) => {
    Intercom("hide")
  })
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  const prev = lifecycle.state()
  return queue
    .enqueue((Intercom) => {
      Intercom("shutdown")
    })
    .then(() => {
      store.reset()
      queue.reset()
      lifecycle.transition("shutdown")
      if (currentAppId && prev === "ready") {
        const fn = w().Intercom
        if (typeof fn === "function") fn("boot", { app_id: currentAppId })
      }
    })
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-intercom")
  const g = w()
  Reflect.deleteProperty(g, "Intercom")
  Reflect.deleteProperty(g, "intercomSettings")
  currentAppId = undefined
  currentOptions = undefined
  queue.reset()
  store.reset()
  unreadListeners.clear()
  unreadBound = false
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
