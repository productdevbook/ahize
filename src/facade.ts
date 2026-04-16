/**
 * mountFacade — sub-2KB launcher button that defers loading the real
 * widget until the visitor interacts.
 *
 * @module
 */
// Lightweight launcher — renders a provider-shaped floating button with
// pure DOM + inline styles. No framework, no CSS file. Under 2KB gzipped.
// On first interaction, it calls the provided boot() and replaces itself.
//
// Use this when you want perfect LCP without shipping the provider CDN on
// first paint. See docs/performance.md for the full facade pattern.

import { isBrowser } from "./_loader.ts"

/** Providers for which `mountFacade()` ships a pre-styled pill button. */
export type FacadeProvider = "intercom" | "crisp" | "tawk" | "zendesk" | "hubspot" | "chatwoot"

/** Options for `mountFacade()`. */
export interface FacadeOptions {
  provider: FacadeProvider
  /** Boot the real provider. Called on first interaction (hover/click). */
  boot: () => Promise<void>
  /** After boot, optionally show the widget (default: true on click). */
  autoShow?: boolean
  /** Visual override. If omitted, falls back to provider defaults. */
  color?: string
  /** Position from corner, default: { bottom: 20, right: 20 }. */
  position?: { top?: number; bottom?: number; left?: number; right?: number }
  /** Custom z-index, default 2147482647. */
  zIndex?: number
  /** ARIA label, default "Open chat". */
  ariaLabel?: string
}

const DEFAULT_COLOR: Record<FacadeProvider, string> = {
  intercom: "#0057FF",
  crisp: "#1972F5",
  tawk: "#00A885",
  zendesk: "#03363D",
  hubspot: "#FF7A59",
  chatwoot: "#1F93FF",
}

const Z_INDEX_MAX_SAFE = 2_147_482_647

/** Handle returned by `mountFacade()` for programmatic control. */
export interface FacadeHandle {
  element(): HTMLElement | undefined
  destroy(): void
  boot(): Promise<void>
}

interface HTMLButton {
  style: Record<string, string>
  setAttribute(name: string, value: string): void
  addEventListener(type: string, listener: () => void, opts?: unknown): void
  innerHTML: string
  remove(): void
}

interface FacadeDoc {
  createElement(tag: "button"): HTMLButton
  body: { appendChild(el: unknown): void }
}

/** Mount a lightweight launcher button that defers loading the real
 *  widget CDN until the visitor hovers or clicks. Returns a handle with
 *  `destroy()` and `boot()`. No-op when called on the server. */
export function mountFacade(opts: FacadeOptions): FacadeHandle {
  if (!isBrowser()) {
    return {
      element: () => undefined,
      destroy: () => {},
      boot: async () => {},
    }
  }

  const color = opts.color ?? DEFAULT_COLOR[opts.provider]
  const z = opts.zIndex ?? Z_INDEX_MAX_SAFE
  const pos = opts.position ?? { bottom: 20, right: 20 }
  const autoShow = opts.autoShow ?? true

  const doc = document as unknown as FacadeDoc
  const button = doc.createElement("button")
  button.setAttribute("type", "button")
  button.setAttribute("aria-label", opts.ariaLabel ?? "Open chat")
  button.setAttribute("data-ahize-facade", opts.provider)
  const style: Record<string, string> = {
    position: "fixed",
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    border: "none",
    background: color,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    cursor: "pointer",
    zIndex: String(z),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 0.2s ease",
  }
  if (pos.top !== undefined) style["top"] = `${pos.top}px`
  if (pos.bottom !== undefined) style["bottom"] = `${pos.bottom}px`
  if (pos.left !== undefined) style["left"] = `${pos.left}px`
  if (pos.right !== undefined) style["right"] = `${pos.right}px`
  for (const [k, v] of Object.entries(style)) button.style[k] = v

  button.innerHTML =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="#fff"/></svg>'

  let booted = false
  let bootPromise: Promise<void> | undefined

  const triggerBoot = (): Promise<void> => {
    if (bootPromise) return bootPromise
    booted = true
    bootPromise = opts.boot().then(() => {
      button.remove()
    })
    return bootPromise
  }

  button.addEventListener("pointerenter", () => {
    if (!booted) void triggerBoot()
  })
  button.addEventListener(
    "click",
    () => {
      void triggerBoot().then(() => {
        if (autoShow) {
          const g = globalThis as unknown as Record<string, unknown>
          const tryShow = (key: string, method: string, ...args: unknown[]) => {
            const api = g[key] as ((...args: unknown[]) => void) | undefined
            if (typeof api === "function") (api as (...args: unknown[]) => void)(method, ...args)
          }
          if (opts.provider === "intercom") tryShow("Intercom", "show")
          if (opts.provider === "zendesk") {
            tryShow("zE", "messenger", "open")
          }
        }
      })
    },
    { once: false },
  )

  doc.body.appendChild(button)

  return {
    element: () => button as unknown as HTMLElement,
    destroy: () => button.remove(),
    boot: triggerBoot,
  }
}
