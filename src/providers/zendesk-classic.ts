/**
 * Zendesk Web Widget Classic — wrapped under the unified `ahize` provider
 * surface. Predates Messenger; different snippet and API surface
 * (`zE('webWidget', '...')`). Kept separate from `ahize/zendesk` so types
 * don't pretend cross-compatibility.
 *
 * @deprecated Web Widget (Classic) is only available on Zendesk accounts
 * created before 2023-06-05. The underlying Chat Web SDK / Chat Conversation
 * APIs entered active removal on 2025-04-30. New integrations should use
 * `ahize/zendesk` (Messenger). See
 * https://github.com/productdevbook/ahize/issues/97 for migration notes.
 *
 * @module
 */
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

type ZendeskFn = (api: string, command: string, ...args: unknown[]) => void

interface ZendeskWindow {
  zE?: ZendeskFn
  zESettings?: Record<string, unknown>
}

function w(): ZendeskWindow {
  return globalThis as unknown as ZendeskWindow
}

const queue = createQueue<ZendeskFn>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
let sunsetWarned = false

/** Load-time options for this provider's `load()` call. */
export interface ZendeskClassicLoadOptions extends LoadOptions {
  key: string
}

/** Inject the zendesk-classic CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: ZendeskClassicLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  if (!sunsetWarned) {
    sunsetWarned = true
    console.warn(
      "[ahize/zendesk-classic] Web Widget (Classic) is only available on Zendesk " +
        "accounts created before 2023-06-05; underlying Chat SDK is being removed. " +
        "Use ahize/zendesk (Messenger) for new integrations. " +
        "See https://github.com/productdevbook/ahize/issues/97",
    )
  }
  const h = hashConfig({ key: options.key })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  await waitForDefer(options.defer ?? "immediate")

  try {
    await injectScript({
      id: "ze-snippet",
      src: `https://static.zdassets.com/ekr/snippet.js?key=${options.key}`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  const fn = w().zE
  if (typeof fn === "function") queue.ready(fn)
  lifecycle.transition("ready")
}

/** Promise that resolves once zendesk-classic's API is live. */
export function ready(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue(() => {})
}

/** Set the current visitor on zendesk-classic. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  store.identify(identity)
  return queue.enqueue((zE) => {
    zE("webWidget", "prefill", {
      name: { value: identity.name, readOnly: false },
      email: { value: identity.email, readOnly: false },
      phone: { value: identity.phone, readOnly: false },
    })
  })
}

/** Emit a custom event to zendesk-classic. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => {
    zE("webWidget", "updatePath", { url: location.href, title: event })
    if (metadata) {
      zE("webWidget", "updateSettings", {
        webWidget: { contactForm: { tags: Object.keys(metadata) } },
      })
    }
  })
}

/** Notify zendesk-classic of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("webWidget", "updatePath"))
}

/** Show / open the zendesk-classic widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => {
    zE("webWidget", "show")
    zE("webWidget", "open")
  })
}

/** Hide / close the zendesk-classic widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((zE) => zE("webWidget", "hide"))
}

/** End the zendesk-classic session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((zE) => zE("webWidget", "logout"))
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

/** Hard reset: remove the injected script, clear globals & listeners,
 *  return to the idle lifecycle state. */
export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ze-snippet")
  const g = w()
  Reflect.deleteProperty(g, "zE")
  Reflect.deleteProperty(g, "zESettings")
  queue.reset()
  store.reset()
  lifecycle.clearConfigHash()
  lifecycle.transition("idle")
}

/** Read the current visitor identity snapshot. */
export function getIdentity(): IdentityState {
  return store.get()
}

/** Subscribe to identity transitions (anonymous ↔ identified). Returns an
 *  unsubscribe function. */
export function onIdentityChange(listener: IdentityListener): () => void {
  return store.onChange(listener)
}

/** Synchronous check — true once the widget is in the `ready` state. */
export function isReady(): boolean {
  return lifecycle.state() === "ready"
}

/** Current lifecycle state: `idle` | `loading` | `ready` | `shutdown`. */
export function state(): "idle" | "loading" | "ready" | "shutdown" {
  return lifecycle.state()
}
