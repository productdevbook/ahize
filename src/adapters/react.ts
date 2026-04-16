// Framework-agnostic React adapter — uses only React hook signatures, no
// runtime React import. Consumer brings their own React. Works in any
// React-compatible runtime (React 18+, Preact via the compat shim).

import type { Identity, IdentityState, LoadOptions } from "../_types.ts"

interface AhizeProvider {
  load(options: LoadOptions): Promise<void>
  identify(identity: Identity): Promise<void>
  show(): Promise<void>
  hide(): Promise<void>
  shutdown(): Promise<void>
  destroy(): Promise<void>
  pageView(info?: { path?: string; locale?: string }): Promise<void>
  getIdentity(): IdentityState
  onIdentityChange(listener: (next: IdentityState, prev: IdentityState) => void): () => void
  isReady(): boolean
}

interface ReactLike {
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  useState<T>(initial: T): [T, (next: T) => void]
  useCallback: <F>(cb: F, deps: readonly unknown[]) => F
}

export interface UseAhizeOptions<TLoadOptions extends LoadOptions> {
  provider: AhizeProvider
  options: TLoadOptions
  /** When true, automatically destroys() on unmount. Default: false. */
  destroyOnUnmount?: boolean
}

export interface UseAhizeReturn {
  isReady: boolean
  identity: IdentityState
  identify: AhizeProvider["identify"]
  show: AhizeProvider["show"]
  hide: AhizeProvider["hide"]
  shutdown: AhizeProvider["shutdown"]
  pageView: AhizeProvider["pageView"]
}

export type AhizeReactHook = <T extends LoadOptions>(opts: UseAhizeOptions<T>) => UseAhizeReturn

export function createUseAhize(React: ReactLike): AhizeReactHook {
  return function useAhize<T extends LoadOptions>(opts: UseAhizeOptions<T>): UseAhizeReturn {
    const { provider, options, destroyOnUnmount = false } = opts
    const [identity, setIdentity] = React.useState<IdentityState>(provider.getIdentity())
    const [ready, setReady] = React.useState<boolean>(provider.isReady())

    React.useEffect(() => {
      let mounted = true
      provider.load(options).then(() => {
        if (mounted) setReady(true)
      })
      const off = provider.onIdentityChange((next) => {
        if (mounted) setIdentity(next)
      })
      return () => {
        mounted = false
        off()
        if (destroyOnUnmount) void provider.destroy()
      }
    }, [provider, JSON.stringify(options), destroyOnUnmount])

    return {
      isReady: ready,
      identity,
      identify: React.useCallback((id: Identity) => provider.identify(id), [provider]),
      show: React.useCallback(() => provider.show(), [provider]),
      hide: React.useCallback(() => provider.hide(), [provider]),
      shutdown: React.useCallback(() => provider.shutdown(), [provider]),
      pageView: React.useCallback(
        (info?: { path?: string; locale?: string }) => provider.pageView(info),
        [provider],
      ),
    }
  }
}
