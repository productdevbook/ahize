/**
 * Main `ahize` entry point. Re-exports shared types (Identity,
 * LoadOptions, EventMetadata, ...) and the AhizeError hierarchy.
 *
 * Providers live under `ahize/<provider>` (`ahize/intercom`, ...);
 * framework adapters under `ahize/<framework>`.
 *
 * @module
 */
export { AhizeError, ProviderNotLoadedError, ScriptLoadError } from "./errors.ts"
export type {
  BaseLoadOptions,
  DeferStrategy,
  EventMetadata,
  Identity,
  IdentityListener,
  IdentityState,
  JsonValue,
  LoadOptions,
  ProviderName,
  Verification,
  Visitor,
} from "./_types.ts"
export { injectScript, isBrowser, readCspNonce, removeScript } from "./_loader.ts"
export { createIdentityStore } from "./_identity.ts"
export type { IdentityStore } from "./_identity.ts"
export { createQueue } from "./_queue.ts"
export type { Queue, QueueOp } from "./_queue.ts"
export {
  createLifecycle,
  hashConfig,
  type Lifecycle,
  type LifecycleListener,
  type LifecycleState,
} from "./_lifecycle.ts"
export { waitForDefer } from "./_defer.ts"
export { mountFacade } from "./facade.ts"
export type { FacadeHandle, FacadeOptions, FacadeProvider } from "./facade.ts"
export {
  cspDirectives,
  mergeCsp,
  toHeaderString,
  watchCspViolations,
  type CspDirectiveKey,
  type CspDirectives,
  type CspOptions,
} from "./csp.ts"
export { capabilities, supports, type ProviderCapabilities } from "./capabilities.ts"
export { diagnose, diagnoseAll } from "./diagnostics.ts"

/** Library version string — bumped automatically on release. */
export const version = "0.0.1"
