export { AhizeError, ProviderNotLoadedError, ScriptLoadError } from "./errors.ts";
export type {
  BaseLoadOptions,
  EventMetadata,
  Identity,
  IdentityListener,
  IdentityState,
  JsonValue,
  LoadOptions,
  ProviderName,
  Verification,
  Visitor,
} from "./_types.ts";
export { injectScript, isBrowser, readCspNonce, removeScript } from "./_loader.ts";
export { createIdentityStore } from "./_identity.ts";
export type { IdentityStore } from "./_identity.ts";
export { createQueue } from "./_queue.ts";
export type { Queue, QueueOp } from "./_queue.ts";
export {
  createLifecycle,
  hashConfig,
  type Lifecycle,
  type LifecycleListener,
  type LifecycleState,
} from "./_lifecycle.ts";

export const version = "0.0.1";
