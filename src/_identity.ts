import type { Identity, IdentityListener, IdentityState } from "./_types.ts"

/** Store with anonymous → identified state transitions and listeners. */
export interface IdentityStore {
  get(): IdentityState
  set(next: IdentityState): void
  identify(identity: Identity): IdentityState
  reset(): IdentityState
  onChange(listener: IdentityListener): () => void
}

/** Build a fresh `IdentityStore`. Each provider keeps its own instance. */
export function createIdentityStore(): IdentityStore {
  let state: IdentityState = { kind: "anonymous" }
  const listeners = new Set<IdentityListener>()

  function set(next: IdentityState): void {
    const prev = state
    state = next
    for (const listener of listeners) listener(next, prev)
  }

  return {
    get: () => state,
    set,
    identify(identity) {
      const next: IdentityState = { kind: "identified", identity }
      set(next)
      return next
    },
    reset() {
      const next: IdentityState = { kind: "anonymous" }
      set(next)
      return next
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
