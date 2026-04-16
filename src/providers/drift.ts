/**
 * Drift conversational marketing widget — wrapped under the unified `ahize`
 * provider surface.
 *
 * @deprecated Drift is being sunset by Clari + Salesloft (announced 2026-03-06,
 * ~60–90 day customer wind-down). Drift was taken offline in Sept 2025 after
 * the Salesloft OAuth breach. New integrations should pick a different
 * provider. See https://github.com/productdevbook/ahize/issues/81 for notes.
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

interface DriftAPI {
  identify(userId: string, attributes?: Record<string, unknown>): void
  track(event: string, props?: Record<string, unknown>): void
  show(): void
  hide(): void
  reset(): void
  on(event: string, cb: (payload: unknown) => void): void
  off(event: string, cb: (payload: unknown) => void): void
  api?: { openChat(): void; setUserAttributes(attrs: Record<string, unknown>): void }
}

interface DriftWindow {
  drift?: DriftAPI
  driftt?: DriftAPI
}

function w(): DriftWindow {
  return globalThis as unknown as DriftWindow
}

const queue = createQueue<DriftAPI>()
const store = createIdentityStore()
const lifecycle = createLifecycle()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined
let sunsetWarned = false

/** Load-time options for this provider's `load()` call. */
export interface DriftLoadOptions extends LoadOptions {
  embedId: string
  version?: string
}

/** Inject the drift CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: DriftLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  if (!sunsetWarned) {
    sunsetWarned = true
    console.warn(
      "[ahize/drift] Drift is being sunset by Clari + Salesloft (announced 2026-03-06). " +
        "New integrations should pick a different provider. " +
        "See https://github.com/productdevbook/ahize/issues/81",
    )
  }
  const h = hashConfig({ embedId: options.embedId })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  await waitForDefer(options.defer ?? "immediate")

  const version = options.version ?? "latest"
  try {
    await injectScript({
      id: "ahize-drift",
      src: `https://js.driftt.com/include/${version}/${options.embedId}.js`,
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  for (let i = 0; i < 80; i++) {
    const drift = w().drift
    if (drift) {
      queue.ready(drift)
      drift.on("ready", () => readyResolve?.())
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  lifecycle.transition("ready")
}

/** Promise that resolves once drift's API is live. */
export function ready(): Promise<void> {
  return readyPromise ?? Promise.resolve()
}

/** Set the current visitor on drift. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (!identity.id) return Promise.resolve()
  if (identity.verification && identity.verification.kind !== "jwt") {
    return Promise.reject(new Error("Drift requires JWT verification (kind: 'jwt')"))
  }
  store.identify(identity)
  return queue.enqueue((drift) => {
    const attrs: Record<string, unknown> = {
      email: identity.email,
      name: identity.name,
      phone: identity.phone,
      ...identity.attributes,
    }
    if (identity.verification?.kind === "jwt") attrs["userJwt"] = identity.verification.token
    drift.identify(identity.id as string, attrs)
  })
}

/** Emit a custom event to drift. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((drift) => drift.track(event, metadata))
}

/** Notify drift of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((drift) => drift.track("pageView"))
}

/** Show / open the drift widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((drift) => drift.show())
}

/** Hide / close the drift widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((drift) => drift.hide())
}

/** Open the chat panel directly (Drift-specific deep link). */
export function openChat(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((drift) => drift.api?.openChat())
}

/** End the drift session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((drift) => drift.reset())
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
  removeScript("ahize-drift")
  const g = w()
  Reflect.deleteProperty(g, "drift")
  Reflect.deleteProperty(g, "driftt")
  queue.reset()
  store.reset()
  readyPromise = undefined
  readyResolve = undefined
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
