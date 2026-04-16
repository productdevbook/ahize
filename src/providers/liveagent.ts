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

interface LiveAgentAPI {
  setUserDetails(email: string, firstName: string, lastName: string, phone: string): void
  addContactField(field: string, value: unknown): void
  createButton(buttonId: string, container?: unknown): void
  hideButton?(buttonId: string): void
  onChatStarted?: () => void
  onChatEnded?: () => void
}

interface LiveAgentWindow {
  LiveAgent?: LiveAgentAPI
}

function w(): LiveAgentWindow {
  return globalThis as unknown as LiveAgentWindow
}

const queue = createQueue<LiveAgentAPI>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
let currentSubdomain: string | undefined
let currentButtonId: string | undefined

export interface LiveAgentLoadOptions extends LoadOptions {
  /** e.g. "yourcompany" — yourcompany.ladesk.com */
  accountSubdomain: string
  buttonId: string
  /** Self-hosted base URL override (e.g. "https://support.example.com"). */
  selfHostedBaseUrl?: string
}

export async function load(options: LiveAgentLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({
    sub: options.accountSubdomain,
    button: options.buttonId,
    base: options.selfHostedBaseUrl,
  })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  currentSubdomain = options.accountSubdomain
  currentButtonId = options.buttonId
  await waitForDefer(options.defer ?? "immediate")

  const base = options.selfHostedBaseUrl ?? `https://${options.accountSubdomain}.ladesk.com`

  try {
    await injectScript({
      id: "ahize-liveagent",
      src: `${base}/scripts/track.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const api = w().LiveAgent
    if (api) {
      api.createButton(options.buttonId)
      queue.ready(api)
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
  return queue.enqueue((api) => {
    const [first, ...rest] = (identity.name ?? "").split(" ")
    api.setUserDetails(identity.email ?? "", first ?? "", rest.join(" "), identity.phone ?? "")
    if (identity.attributes) {
      for (const [k, v] of Object.entries(identity.attributes)) api.addContactField(k, v)
    }
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    api.addContactField(event, metadata ?? true)
  })
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(() => {
    // LiveAgent button visibility is managed via CSS on the injected button container.
  })
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((api) => {
    if (currentButtonId) api.hideButton?.(currentButtonId)
  })
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
  removeScript("ahize-liveagent")
  const g = w()
  Reflect.deleteProperty(g, "LiveAgent")
  queue.reset()
  store.reset()
  currentSubdomain = undefined
  currentButtonId = undefined
  lifecycle.clearConfigHash()
  lifecycle.transition("idle")
}

export function getConfig(): { subdomain?: string; buttonId?: string } {
  return { subdomain: currentSubdomain, buttonId: currentButtonId }
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
