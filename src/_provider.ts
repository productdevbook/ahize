import { createIdentityStore, type IdentityStore } from "./_identity.ts"
import { createLifecycle, hashConfig, type Lifecycle, type LifecycleState } from "./_lifecycle.ts"
import { isBrowser } from "./_loader.ts"
import { createQueue, type Queue } from "./_queue.ts"
import type { IdentityListener, IdentityState } from "./_types.ts"

/** Internal helper aggregating queue + identity store + lifecycle. */
export interface ProviderContext<T> {
  queue: Queue<T>
  store: IdentityStore
  lifecycle: Lifecycle
}

/** Internal helper — bundles a queue, identity store, and lifecycle. */
export function createProviderContext<T>(): ProviderContext<T> {
  return {
    queue: createQueue<T>(),
    store: createIdentityStore(),
    lifecycle: createLifecycle(),
  }
}

/** Internal helper — extract the standard public surface from a provider context. */
export function publicApi<T>(ctx: ProviderContext<T>): {
  getIdentity: () => IdentityState
  onIdentityChange: (listener: IdentityListener) => () => void
  isReady: () => boolean
  state: () => LifecycleState
} {
  return {
    getIdentity: () => ctx.store.get(),
    onIdentityChange: (l) => ctx.store.onChange(l),
    isReady: () => ctx.lifecycle.state() === "ready",
    state: () => ctx.lifecycle.state(),
  }
}

export { hashConfig, isBrowser }
