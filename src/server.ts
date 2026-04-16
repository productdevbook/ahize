/**
 * SSR-safe stub. Mirrors every provider/adapter export as a typed
 * no-op so server runtimes can import `ahize/server` without touching
 * window or document.
 *
 * @module
 */
// Server-side stub — safe to import from any SSR environment.
// Every method is a no-op that matches the client surface shape, so
// consumers can unconditionally import { load, identify, ... } from "ahize/server"
// when they know they're rendering on the server.
//
// Tree-shaking keeps DOM code out of the SSR bundle because this entry
// never imports from _loader.ts or provider modules.

import type {
  EventMetadata,
  Identity,
  IdentityListener,
  IdentityState,
  LoadOptions,
} from "./_types.ts"

const anonymous: IdentityState = { kind: "anonymous" }

/** SSR-safe no-op. See `ahize/server` module docs. */
export async function load(_options?: LoadOptions): Promise<void> {
  // noop
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export async function identify(_identity: Identity): Promise<void> {
  // noop
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export async function track<T extends EventMetadata = EventMetadata>(
  _event: string,
  _metadata?: T,
): Promise<void> {
  // noop
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export async function pageView(_info?: { path?: string; locale?: string }): Promise<void> {
  // noop
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export async function show(): Promise<void> {
  // noop
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export async function hide(): Promise<void> {
  // noop
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export async function shutdown(): Promise<void> {
  // noop
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export async function destroy(): Promise<void> {
  // noop
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export function getIdentity(): IdentityState {
  return anonymous
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export function onIdentityChange(_listener: IdentityListener): () => void {
  return () => {}
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export function isReady(): boolean {
  return false
}

/** SSR-safe no-op. See `ahize/server` module docs. */
export function state(): "idle" {
  return "idle"
}
