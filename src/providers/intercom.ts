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
const showListeners = new Set<() => void>()
const hideListeners = new Set<() => void>()
const emailSuppliedListeners = new Set<(email: string) => void>()
let currentAppId: string | undefined
let currentOptions: IntercomLoadOptions | undefined
let readyPromise: Promise<void> | undefined
let readyResolve: (() => void) | undefined
let unreadBound = false
let lifecycleEventsBound = false

export type IntercomRegion = "us" | "eu" | "au"

const TYPED_BOOT_KEYS = [
  "hide_default_launcher",
  "custom_launcher_selector",
  "alignment",
  "horizontal_padding",
  "vertical_padding",
  "action_color",
  "background_color",
  "session_duration",
  "z_index",
  "hide_notifications",
  "theme_mode",
] as const

export interface IntercomLoadOptions extends LoadOptions {
  appId: string
  region?: IntercomRegion
  /** When false, load() returns immediately without injecting. Default: true. */
  enabled?: boolean
  /** Hide the floating launcher button. */
  hide_default_launcher?: boolean
  /** CSS selector to bind the launcher to a custom element. */
  custom_launcher_selector?: string
  /** Launcher alignment. */
  alignment?: "left" | "right"
  /** Horizontal launcher offset (px, min 20). */
  horizontal_padding?: number
  /** Vertical launcher offset (px, min 20). */
  vertical_padding?: number
  /** Primary action color (CSS color). */
  action_color?: string
  /** Messenger background color (CSS color). */
  background_color?: string
  /** Visitor session length (ms). */
  session_duration?: number
  /** Messenger z-index. */
  z_index?: number
  /** Hide in-app notifications. */
  hide_notifications?: boolean
  /** Color scheme. */
  theme_mode?: "light" | "dark" | "system"
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
  const typedBoot: Record<string, unknown> = {}
  for (const key of TYPED_BOOT_KEYS) {
    const v = options[key]
    if (v !== undefined) typedBoot[key] = v
  }
  const bootPayload: Record<string, unknown> = {
    app_id: options.appId,
    ...(apiBase ? { api_base: apiBase } : {}),
    ...typedBoot,
  }
  w().intercomSettings = bootPayload
  const stub = ensureStub()
  stub("boot", bootPayload)

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
    if (!lifecycleEventsBound) {
      fn("onShow", () => {
        for (const l of showListeners) l()
      })
      fn("onHide", () => {
        for (const l of hideListeners) l()
      })
      fn("onUserEmailSupplied", (email: string) => {
        for (const l of emailSuppliedListeners) l(email)
      })
      lifecycleEventsBound = true
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

export function onShow(listener: () => void): () => void {
  showListeners.add(listener)
  return () => showListeners.delete(listener)
}

export function onHide(listener: () => void): () => void {
  hideListeners.add(listener)
  return () => hideListeners.delete(listener)
}

export function onUserEmailSupplied(listener: (email: string) => void): () => void {
  emailSuppliedListeners.add(listener)
  return () => emailSuppliedListeners.delete(listener)
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

export type IntercomSpace = "home" | "messages" | "help" | "news" | "tasks" | "tickets"

function call(command: string, ...args: unknown[]): Promise<void> {
  if (!isBrowser()) return Promise.resolve()
  return queue.enqueue((Intercom) => Intercom(command, ...args))
}

export function showSpace(space: IntercomSpace): Promise<void> {
  return call("showSpace", space)
}

export function showMessages(): Promise<void> {
  return call("showMessages")
}

export function showNewMessage(prefilledContent?: string): Promise<void> {
  return prefilledContent === undefined
    ? call("showNewMessage")
    : call("showNewMessage", prefilledContent)
}

export function showConversation(conversationId: string): Promise<void> {
  return call("showConversation", conversationId)
}

export function showTicket(ticketId: string): Promise<void> {
  return call("showTicket", ticketId)
}

export function showArticle(articleId: string): Promise<void> {
  return call("showArticle", articleId)
}

export function showNews(newsItemId: string): Promise<void> {
  return call("showNews", newsItemId)
}

export function startTour(tourId: string): Promise<void> {
  return call("startTour", tourId)
}

export function startSurvey(surveyId: string): Promise<void> {
  return call("startSurvey", surveyId)
}

export function startChecklist(checklistId: string): Promise<void> {
  return call("startChecklist", checklistId)
}

export function startConversation(message: string): Promise<void> {
  return call("startConversation", message)
}

export function hideNotifications(hidden: boolean): Promise<void> {
  return call("hideNotifications", hidden)
}

export function getVisitorId(): Promise<string | undefined> {
  if (!isBrowser()) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    queue
      .enqueue((Intercom) => {
        const result = (Intercom as unknown as (cmd: string) => unknown)("getVisitorId")
        resolve(typeof result === "string" ? result : undefined)
      })
      .catch(() => resolve(undefined))
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
  showListeners.clear()
  hideListeners.clear()
  emailSuppliedListeners.clear()
  unreadBound = false
  lifecycleEventsBound = false
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
