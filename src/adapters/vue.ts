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

interface VueLike {
  ref<T>(initial: T): { value: T }
  onMounted(cb: () => void): void
  onUnmounted(cb: () => void): void
}

export function createUseAhize(Vue: VueLike) {
  return function useAhize<T extends LoadOptions>(opts: {
    provider: AhizeProvider
    options: T
    destroyOnUnmount?: boolean
  }) {
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
