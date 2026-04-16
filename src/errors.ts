export class AhizeError extends Error {
  override name = "AhizeError"
}

export class ProviderNotLoadedError extends AhizeError {
  override name = "ProviderNotLoadedError"
}

export class ScriptLoadError extends AhizeError {
  override name = "ScriptLoadError"
}
