// Next.js adapters — both App Router and Pages Router.
//
// App Router usage:
//   "use client";
//   import { Ahize } from "ahize/next";
//   import * as intercom from "ahize/intercom";
//   <Ahize provider={intercom} options={{ appId: "..." }} />
//
// Pages Router usage:
//   import { Ahize } from "ahize/next";
//   inside _app.tsx return <Ahize ... />
//
// pageView() auto-fires on usePathname() change. Bring your own React.

import type { Identity, IdentityState, LoadOptions } from "../_types.ts"

interface AhizeProvider {
  load(options: LoadOptions): Promise<void>
  identify(identity: Identity): Promise<void>
  pageView(info?: { path?: string; locale?: string }): Promise<void>
  shutdown(): Promise<void>
  destroy(): Promise<void>
  onIdentityChange(listener: (next: IdentityState, prev: IdentityState) => void): () => void
  isReady(): boolean
}

interface ReactLike {
  useEffect(cb: () => void | (() => void), deps?: readonly unknown[]): void
  createElement(
    tag: string | unknown,
    props?: Record<string, unknown>,
    ...children: unknown[]
  ): unknown
}

interface NextAppRouterHooks {
  /** next/navigation usePathname() */
  usePathname?: () => string
  /** next/navigation useSearchParams() */
  useSearchParams?: () => { toString(): string }
}

export interface NextAhizeOptions<T extends LoadOptions> {
  provider: AhizeProvider
  options: T
  /** Optional identity to apply after load(). */
  identity?: Identity
  /** Auto-fire pageView on App Router path change. */
  autoPageView?: boolean
}

export function createAhizeComponent(React: ReactLike, nextNav?: NextAppRouterHooks) {
  return function Ahize<T extends LoadOptions>(props: NextAhizeOptions<T>) {
    React.useEffect(() => {
      let mounted = true
      props.provider.load(props.options).then(() => {
        if (mounted && props.identity) void props.provider.identify(props.identity)
      })
      return () => {
        mounted = false
      }
    }, [props.provider, JSON.stringify(props.options)])

    const pathname = nextNav?.usePathname?.()
    const search = nextNav?.useSearchParams?.()?.toString()
    React.useEffect(() => {
      if (!props.autoPageView || !pathname) return
      void props.provider.pageView({ path: search ? `${pathname}?${search}` : pathname })
    }, [pathname, search, props.autoPageView])

    return null
  }
}
