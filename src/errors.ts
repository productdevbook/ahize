/** Base class for every error thrown by `ahize`. Use `instanceof` to gate
 *  provider-specific recovery paths. */
export class AhizeError extends Error {
  override name = "AhizeError"
}

/** Thrown when a provider method is called before `load()` has fully
 *  resolved and the underlying SDK is unavailable. */
export class ProviderNotLoadedError extends AhizeError {
  override name = "ProviderNotLoadedError"
}

/** Thrown when the CDN `<script>` tag fires an `error` event (network
 *  failure, blocked by an ad-blocker, CSP violation, etc.). */
export class ScriptLoadError extends AhizeError {
  override name = "ScriptLoadError"
}
