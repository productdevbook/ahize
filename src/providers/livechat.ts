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

interface LiveChatWidget {
  call(method: string, ...args: unknown[]): void
  on(event: string, cb: (payload: unknown) => void): void
  off(event: string, cb: (payload: unknown) => void): void
  get<T = unknown>(method: string): T
  init?(): void
}

interface LiveChatLcConfig {
  license: number
  integration_name?: string
  product_name?: string
  group?: number
  visibility?: "maximized" | "minimized" | "hidden"
  sessionVariables?: Record<string, string>
  customerName?: string
  customerEmail?: string
  chatBetweenGroups?: boolean
  asyncInit?: boolean
  [key: string]: unknown
}

interface LiveChatWindow {
  __lc?: LiveChatLcConfig
  LiveChatWidget?: LiveChatWidget
}

function w(): LiveChatWindow {
  return globalThis as unknown as LiveChatWindow
}

const queue = createQueue<LiveChatWidget>()
const store = createIdentityStore()
const lifecycle = createLifecycle()

export type LiveChatEventName =
  | "ready"
  | "availabilityChanged"
  | "visibilityChanged"
  | "customerStatusChanged"
  | "newEvent"
  | "formSubmitted"
  | "ratingSubmitted"
  | "greetingDisplayed"
  | "greetingHidden"
  | "richMessageButtonClicked"

const LIVECHAT_EVENT_MAP: Record<LiveChatEventName, string> = {
  ready: "ready",
  availabilityChanged: "availability_changed",
  visibilityChanged: "visibility_changed",
  customerStatusChanged: "customer_status_changed",
  newEvent: "new_event",
  formSubmitted: "form_submitted",
  ratingSubmitted: "rating_submitted",
  greetingDisplayed: "greeting_displayed",
  greetingHidden: "greeting_hidden",
  richMessageButtonClicked: "rich_message_button_clicked",
}

const eventListeners = new Map<LiveChatEventName, Set<(payload?: unknown) => void>>()
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined

const TYPED_LC_KEYS = [
  "group",
  "visibility",
  "sessionVariables",
  "customerName",
  "customerEmail",
  "chatBetweenGroups",
  "asyncInit",
] as const

export interface LiveChatLoadOptions extends LoadOptions {
  license: number
  /** Route to a specific agent group. */
  group?: number
  /** Initial widget visibility. */
  visibility?: "maximized" | "minimized" | "hidden"
  /** Session variables set at init time. */
  sessionVariables?: Record<string, string>
  /** Pre-fill customer name. */
  customerName?: string
  /** Pre-fill customer email. */
  customerEmail?: string
  /** Allow customer to chat across multiple groups. */
  chatBetweenGroups?: boolean
  /** Defer LiveChatWidget.init() until manually called via the SDK. */
  asyncInit?: boolean
}

export async function load(options: LiveChatLoadOptions): Promise<void> {
  if (!isBrowser()) return
  if (options.consent === false) return
  const h = hashConfig({ license: options.license })
  if (lifecycle.state() === "ready" && lifecycle.configHash() === h) return
  if (lifecycle.configHash() && lifecycle.configHash() !== h) await destroy()

  lifecycle.transition("loading")
  lifecycle.setConfigHash(h)
  readyPromise = new Promise((r) => {
    readyResolve = r
  })
  await waitForDefer(options.defer ?? "immediate")

  const lc: LiveChatLcConfig = {
    license: options.license,
    integration_name: "ahize",
    product_name: "ahize",
  }
  for (const key of TYPED_LC_KEYS) {
    const v = options[key]
    if (v !== undefined) (lc as Record<string, unknown>)[key] = v
  }
  w().__lc = lc

  try {
    await injectScript({
      id: "ahize-livechat",
      src: "https://cdn.livechatinc.com/tracking.js",
      nonce: options.nonce,
      partytown: options.partytown,
    })
  } catch (error) {
    lifecycle.transition("idle")
    lifecycle.clearConfigHash()
    throw error
  }

  // Poll briefly for the widget to attach.
  for (let i = 0; i < 80; i++) {
    const widget = w().LiveChatWidget
    if (widget) {
      queue.ready(widget)
      // Wire every documented widget event to the typed emitter.
      for (const [mapped, vendor] of Object.entries(LIVECHAT_EVENT_MAP) as Array<
        [LiveChatEventName, string]
      >) {
        widget.on(vendor, (payload: unknown) => {
          const set = eventListeners.get(mapped)
          if (set) for (const l of set) l(payload)
          if (mapped === "ready") readyResolve?.()
        })
      }
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
  store.identify(identity)
  return queue.enqueue((widget) => {
    if (identity.email) widget.call("set_customer_email", identity.email)
    if (identity.name) widget.call("set_customer_name", identity.name)
    if (identity.attributes) {
      widget.call("update_session_variables", identity.attributes)
    }
  })
}

export function track<T extends EventMetadata = EventMetadata>(
  event: string,
  metadata?: T,
): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => {
    widget.call("update_session_variables", { [event]: metadata })
  })
}

export function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  return Promise.resolve()
}

export function show(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.call("maximize"))
}

export function hide(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.call("hide"))
}

export function maximize(messageDraft?: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) =>
    messageDraft === undefined ? widget.call("maximize") : widget.call("maximize", messageDraft),
  )
}

export function minimize(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.call("minimize"))
}

export function hideGreeting(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.call("hide_greeting"))
}

export function triggerSalesTracker(args: {
  trackerId: number
  orderPrice: number
  orderId?: string
}): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.call("trigger_sales_tracker", args))
}

export function setSessionVariables(vars: Record<string, string>): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((widget) => widget.call("set_session_variables", vars))
}

export function get<T = unknown>(method: string): T | undefined {
  if (!isBrowser()) return undefined
  return w().LiveChatWidget?.get<T>(method)
}

export function getState(): unknown {
  return get("state")
}

export function getCustomerData(): unknown {
  return get("customer_data")
}

export function getChatData(): unknown {
  return get("chat_data")
}

export function on(event: LiveChatEventName, listener: (payload?: unknown) => void): () => void {
  let set = eventListeners.get(event)
  if (!set) {
    set = new Set()
    eventListeners.set(event, set)
  }
  set.add(listener)
  return () => set?.delete(listener)
}

export function shutdown(): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue
    .enqueue((widget) => widget.call("destroy"))
    .then(() => {
      store.reset()
      lifecycle.transition("shutdown")
    })
}

export async function destroy(): Promise<void> {
  if (!isBrowser()) return
  await shutdown().catch(() => undefined)
  removeScript("ahize-livechat")
  const g = w()
  Reflect.deleteProperty(g, "__lc")
  Reflect.deleteProperty(g, "LiveChatWidget")
  queue.reset()
  store.reset()
  eventListeners.clear()
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
