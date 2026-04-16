export { AhizeError, ProviderNotLoadedError, ScriptLoadError } from "./errors.ts";
export type {
  Identity,
  IdentityListener,
  IdentityState,
  LoadOptions,
  ProviderName,
  Verification,
  Visitor,
} from "./_types.ts";
export { injectScript, isBrowser } from "./_loader.ts";
export { createIdentityStore } from "./_identity.ts";
export type { IdentityStore } from "./_identity.ts";
export { createQueue } from "./_queue.ts";
export type { Queue, QueueOp } from "./_queue.ts";

export const version = "0.0.1";
