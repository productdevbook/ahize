/**
 * Sendbird AI Chatbot Widget — wrapped under the unified `ahize` provider
 * surface. (Sendbird is a chat platform, not a support widget; the unified
 * surface maps awkwardly: track() throws, identify() is part of boot options,
 * show()/hide() are CSS-level. Use Sendbird Desk for full support semantics.)
 *
 * @deprecated The Sendbird AI Chatbot Widget product is discontinued. The
 * source repo `sendbird/chat-ai-widget` was archived 2025-07-09 at v1.9.7 and
 * the AI Chatbot docs were removed from sendbird.com. The successor "AI Agent"
 * has a different API surface; Sendbird Desk is recommended for support
 * semantics. See https://github.com/productdevbook/ahize/issues/91 for notes.
 *
 * @module
 */
import { waitForDefer } from "../_defer.ts"
import { createIdentityStore } from "../_identity.ts"
import { createLifecycle, hashConfig } from "../_lifecycle.ts"
import { injectScript, isBrowser, removeScript } from "../_loader.ts"
import { AhizeError } from "../errors.ts"
import type {
  EventMetadata,
  Identity,
  IdentityListener,
  IdentityState,
  LoadOptions,
} from "../_types.ts"

interface SendbirdWidgetSettings {
  applicationId: string
  botId: string
  userId?: string
  sessionToken?: string
}

interface SendbirdWindow {
  __sb_widget_settings?: SendbirdWidgetSettings
}

function w(): SendbirdWindow {
  return globalThis as unknown as SendbirdWindow
}

const store = createIdentityStore()
const lifecycle = createLifecycle()
let currentSettings: SendbirdWidgetSettings | undefined
let trackForwarder: ((event: string, metadata?: EventMetadata) => void) | undefined
let sunsetWarned = false

/** Error class — thrown when this provider hits an unsupported case. */
export class SendbirdUnsupportedError extends AhizeError {
  override name = "SendbirdUnsupportedError"
}

/** Load-time options for this provider's `load()` call. */
export interface SendbirdLoadOptions extends LoadOptions {
  applicationId: string
  botId: string
  userId?: string
  sessionToken?: string
  /** Optional callback to receive track() events instead of throwing. */
  onTrack?: (event: string, metadata?: EventMetadata) => void
}

/** Inject the sendbird CDN script and boot the widget. Queues any
 *  methods called before the real API attaches; resolves when ready. */
export async function load(options: SendbirdLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  if (!sunsetWarned) {
    sunsetWarned = true
    console.warn(
      "[ahize/sendbird] The Sendbird AI Chatbot Widget product is discontinued " +
        "(repo archived 2025-07-09 at v1.9.7). Consider Sendbird Desk or another provider. " +
        "See https://github.com/productdevbook/ahize/issues/91",
    )
  }
  const h = hashConfig({
    appId: options.applicationId,
    botId: options.botId,
    userId: options.userId,
  })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  await waitForDefer(options.defer ?? "immediate")

  currentSettings = {
    applicationId: options.applicationId,
    botId: options.botId,
    userId: options.userId,
    sessionToken: options.sessionToken,
  }
  trackForwarder = options.onTrack
  w().__sb_widget_settings = currentSettings

  try {
    await injectScript({
      id: "ahize-sendbird",
      src: "https://aichatbot.sendbird.com/index.js",
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }
  lifecycle.transition("ready")
}

/** Promise that resolves once sendbird's API is live. */
export function ready(): Promise<void> {
  return Promise.resolve()
}

/** Set the current visitor on sendbird. Supports anonymous → identified
 *  transitions and provider-specific verification (HMAC/JWT/callback). */
export async function identify(identity: Identity): Promise<void> {
  if (!isBrowser()) return
  // Identity changes require a remount in Sendbird's model.
  if (currentSettings && identity.id && identity.id !== currentSettings.userId) {
    const next: SendbirdLoadOptions = {
      applicationId: currentSettings.applicationId,
      botId: currentSettings.botId,
      userId: identity.id,
      sessionToken:
        identity.verification?.kind === "jwt"
          ? identity.verification.token
          : currentSettings.sessionToken,
    }
    await destroy()
    await load(next)
  }
  store.identify(identity)
}

/** Emit a custom event to sendbird. `metadata` is typed as
 *  `EventMetadata` (a JSON-serialisable record). */
export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  if (trackForwarder) {
    trackForwarder(event, metadata)
    return Promise.resolve()
  }
  return Promise.reject(
    new SendbirdUnsupportedError(
      `track('${event}') is unsupported by Sendbird (no agent inbox). Pass options.onTrack to opt out.`,
    ),
  )
}

/** Notify sendbird of an SPA route change so its targeting & session
 *  tracking stay accurate. */
export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

function setLauncherDisplay(value: "block" | "none"): void {
  const els = document.querySelectorAll(".sendbird-chat-widget-launcher")
  for (let i = 0; i < els.length; i++) {
    const el = els[i] as unknown as { style?: Record<string, string> }
    if (el.style) el.style["display"] = value
  }
}

/** Show / open the sendbird widget. */
export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  setLauncherDisplay("block")
  return Promise.resolve()
}

/** Hide / close the sendbird widget. */
export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  setLauncherDisplay("none")
  return Promise.resolve()
}

/** End the sendbird session without removing the CDN script. The
 *  provider can be re-identified with `identify()` afterwards. */
export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  store.reset()
  lifecycle.transition("shutdown")
  return Promise.resolve()
}

/** Hard reset: remove the injected script, clear globals & listeners,
 *  return to the idle lifecycle state. */
export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-sendbird")
  const g = w()
  Reflect.deleteProperty(g, "__sb_widget_settings")
  store.reset()
  currentSettings = undefined
  trackForwarder = undefined
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
