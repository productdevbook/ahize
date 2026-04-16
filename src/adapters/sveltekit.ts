/**
 * SvelteKit adapter wiring afterNavigate to pageView.
 *
 * @module
 */
// SvelteKit `+layout.svelte` adapter. Use afterNavigate from $app/navigation
// to fire pageView on each client-side route change.

import type { Identity, LoadOptions } from "../_types.ts"

interface AhizeProvider {
  load(options: LoadOptions): Promise<void>
  identify(identity: Identity): Promise<void>
  pageView(info?: { path?: string; locale?: string }): Promise<void>
}

interface SvelteKitNavApi {
  afterNavigate: (
    cb: (nav: { to: { url: { pathname: string; search: string } } | null }) => void,
  ) => void
}

/** Options for `setupAhize()`. */
export interface SvelteKitAhizeOptions<T extends LoadOptions> {
  provider: AhizeProvider
  options: T
  identity?: Identity
  autoPageView?: boolean
}

/** Boot the provider and wire `afterNavigate` to `pageView()`. Call
 *  once from your root `+layout.svelte`. */
export async function setupAhize<T extends LoadOptions>(
  opts: SvelteKitAhizeOptions<T>,
  navApi?: SvelteKitNavApi,
): Promise<void> {
  if (typeof window === "undefined") return
  await opts.provider.load(opts.options)
  if (opts.identity) await opts.provider.identify(opts.identity)

  if (opts.autoPageView !== false && navApi?.afterNavigate) {
    navApi.afterNavigate((nav) => {
      if (!nav.to) return
      void opts.provider.pageView({
        path: `${nav.to.url.pathname}${nav.to.url.search}`,
      })
    })
  }
}
