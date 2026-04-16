/**
 * Vue 3 composable.
 *
 * @module
 */
// Vue 3 plugin & composable. Consumer brings their own Vue runtime via
// the createUseAhize(vueImports) factory so we don't peer-dep vue.

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

interface VueRef<T> {
  value: T
}

interface VueLike {
  ref<T>(initial: T): VueRef<T>
  onMounted(cb: () => void): void
  onUnmounted(cb: () => void): void
}

/** Reactive state + bound methods returned by `useAhize()`. */
export interface UseAhizeReturn {
  isReady: VueRef<boolean>
  identity: VueRef<IdentityState>
  identify: (identity: Identity) => Promise<void>
  show: () => Promise<void>
  hide: () => Promise<void>
  shutdown: () => Promise<void>
  pageView: (info?: { path?: string; locale?: string }) => Promise<void>
}

/** Options for the `useAhize()` composable. */
export interface UseAhizeOptions<T extends LoadOptions> {
  provider: AhizeProvider
  options: T
  destroyOnUnmount?: boolean
}

/** Composable signature returned by `createUseAhize()`. */
export type UseAhizeHook = <T extends LoadOptions>(opts: UseAhizeOptions<T>) => UseAhizeReturn

/** Build a Vue 3 `useAhize` composable (consumer brings their own Vue). */
export function createUseAhize(Vue: VueLike): UseAhizeHook {
  return function useAhize<T extends LoadOptions>(opts: UseAhizeOptions<T>): UseAhizeReturn {
    const isReady = Vue.ref(opts.provider.isReady())
    const identity = Vue.ref<IdentityState>(opts.provider.getIdentity())
    let off: (() => void) | undefined

    Vue.onMounted(() => {
      opts.provider.load(opts.options).then(() => {
        isReady.value = true
      })
      off = opts.provider.onIdentityChange((next) => {
        identity.value = next
      })
    })

    Vue.onUnmounted(() => {
      off?.()
      if (opts.destroyOnUnmount) void opts.provider.destroy()
    })

    return {
      isReady,
      identity,
      identify: (id: Identity) => opts.provider.identify(id),
      show: () => opts.provider.show(),
      hide: () => opts.provider.hide(),
      shutdown: () => opts.provider.shutdown(),
      pageView: (info?: { path?: string; locale?: string }) => opts.provider.pageView(info),
    }
  }
}
