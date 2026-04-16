// Remix adapter — re-uses the Next adapter shape (both are React routers).
// Mount once in root.tsx; pageView fires on Remix navigation via the
// useLocation() hook the consumer passes in.

import type { Identity, IdentityState, LoadOptions } from "../_types.ts"

interface AhizeProvider {
  load(options: LoadOptions): Promise<void>
  identify(identity: Identity): Promise<void>
  pageView(info?: { path?: string; locale?: string }): Promise<void>
  shutdown(): Promise<void>
  isReady(): boolean
  getIdentity(): IdentityState
}

interface ReactLike {
  useEffect(cb: () => void | (() => void), deps?: readonly unknown[]): void
}

interface RemixHooks {
  useLocation(): { pathname: string; search: string }
}

export interface RemixAhizeOptions<T extends LoadOptions> {
  provider: AhizeProvider
  options: T
  identity?: Identity
  autoPageView?: boolean
}

export function createRemixAhize(React: ReactLike, remix: RemixHooks) {
  return function useAhize<T extends LoadOptions>(opts: RemixAhizeOptions<T>) {
    React.useEffect(() => {
      opts.provider.load(opts.options).then(() => {
        if (opts.identity) void opts.provider.identify(opts.identity)
      })
    }, [opts.provider, JSON.stringify(opts.options)])

    const location = remix.useLocation()
    React.useEffect(() => {
      if (opts.autoPageView === false) return
      void opts.provider.pageView({ path: `${location.pathname}${location.search}` })
    }, [location.pathname, location.search, opts.autoPageView])
  }
}
