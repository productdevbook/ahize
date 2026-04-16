/** Provider lifecycle state machine values. */
export type LifecycleState = "idle" | "loading" | "ready" | "shutdown"

/** Listener signature for `Lifecycle.onChange`. */
export type LifecycleListener = (next: LifecycleState, prev: LifecycleState) => void

/** Lifecycle controller — tracks state transitions and the current
 *  config hash so providers can detect "same config, skip reload". */
export interface Lifecycle {
  state(): LifecycleState
  transition(next: LifecycleState): void
  onChange(listener: LifecycleListener): () => void
  configHash(): string | undefined
  setConfigHash(hash: string): void
  clearConfigHash(): void
}

/** Build a fresh `Lifecycle` instance. */
export function createLifecycle(): Lifecycle {
  let current: LifecycleState = "idle"
  let hash: string | undefined
  const listeners = new Set<LifecycleListener>()

  return {
    state: () => current,
    transition(next) {
      if (next === current) return
      const prev = current
      current = next
      for (const listener of listeners) listener(next, prev)
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    configHash: () => hash,
    setConfigHash(h) {
      hash = h
    },
    clearConfigHash() {
      hash = undefined
    },
  }
}

/** Compute a stable string hash from a flat config object. Used by
 *  `load()` to detect "same config, skip reinit" cases. */
export function hashConfig(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort()
  const parts: string[] = []
  for (const k of keys) {
    const v = obj[k]
    if (v === undefined || v === null) continue
    if (typeof v === "object") {
      parts.push(`${k}=${JSON.stringify(v)}`)
    } else {
      parts.push(`${k}=${String(v)}`)
    }
  }
  return parts.join("&")
}
