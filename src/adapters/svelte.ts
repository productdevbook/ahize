/**
 * Svelte store.
 *
 * @module
 */
// Framework-agnostic Svelte store factory. Returns a writable-shaped object
// (subscribe + unsubscribe) compatible with Svelte's store contract — Svelte
// itself reads from `subscribe`, so we don't need to import svelte/store.

import type { Identity, IdentityState, LoadOptions } from "../_types.ts"

interface AhizeProvider {
  load(options: LoadOptions): Promise<void>
  identify(identity: Identity): Promise<void>
  show(): Promise<void>
  hide(): Promise<void>
  shutdown(): Promise<void>
  pageView(info?: { path?: string; locale?: string }): Promise<void>
  getIdentity(): IdentityState
  onIdentityChange(listener: (next: IdentityState, prev: IdentityState) => void): () => void
  isReady(): boolean
}

export interface AhizeStoreValue {
  isReady: boolean
  identity: IdentityState
}

export function createAhizeStore<T extends LoadOptions>(
  provider: AhizeProvider,
  options: T,
): {
  subscribe: (run: (value: AhizeStoreValue) => void) => () => void
  identify: (identity: Identity) => Promise<void>
  show: () => Promise<void>
  hide: () => Promise<void>
  shutdown: () => Promise<void>
  pageView: (info?: { path?: string; locale?: string }) => Promise<void>
} {
  const subscribers = new Set<(v: AhizeStoreValue) => void>()
  let value: AhizeStoreValue = {
    isReady: provider.isReady(),
    identity: provider.getIdentity(),
  }
  const emit = () => {
    for (const s of subscribers) s(value)
  }
  let off: (() => void) | undefined
  let booted = false

  return {
    subscribe(run) {
      subscribers.add(run)
      if (!booted) {
        booted = true
        provider.load(options).then(() => {
          value = { ...value, isReady: true }
          emit()
        })
        off = provider.onIdentityChange((next) => {
          value = { ...value, identity: next }
          emit()
        })
      }
      run(value)
      return () => {
        subscribers.delete(run)
        if (subscribers.size === 0) {
          off?.()
          off = undefined
          booted = false
        }
      }
    },
    identify: (id) => provider.identify(id),
    show: () => provider.show(),
    hide: () => provider.hide(),
    shutdown: () => provider.shutdown(),
    pageView: (info) => provider.pageView(info),
  }
}
