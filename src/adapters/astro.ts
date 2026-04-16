/**
 * Astro island + view-transitions.
 *
 * @module
 */
// Astro island integration — `<AhizeIsland client:idle>` boots a provider on
// the client side. Pure framework boundary helper since Astro just renders
// strings server-side; the actual mount runs the provider's load() in the
// browser.

import type { Identity, LoadOptions } from "../_types.ts"

interface AhizeProvider {
  load(options: LoadOptions): Promise<void>
  identify(identity: Identity): Promise<void>
  pageView(info?: { path?: string; locale?: string }): Promise<void>
}

/** Options for `mountAhize()`. */
export interface AstroAhizeOptions<T extends LoadOptions> {
  provider: AhizeProvider
  options: T
  identity?: Identity
  /** Listen on the Astro view-transitions:after-swap event for pageView. */
  autoPageView?: boolean
}

/** Boot a provider from an Astro island. Use with `is:inline` or
 *  client-side scripts. */
export async function mountAhize<T extends LoadOptions>(opts: AstroAhizeOptions<T>): Promise<void> {
  if (typeof window === "undefined") return
  await opts.provider.load(opts.options)
  if (opts.identity) await opts.provider.identify(opts.identity)

  if (opts.autoPageView !== false) {
    document.addEventListener("astro:after-swap", () => {
      void opts.provider.pageView({ path: location.pathname + location.search })
    })
  }
}
