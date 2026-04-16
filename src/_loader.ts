import { ScriptLoadError } from "./errors.ts"

export interface InjectOptions {
  src: string
  id?: string
  async?: boolean
  defer?: boolean
  nonce?: string
  /** When true, inject as `<script type="text/partytown">` for worker offload. */
  partytown?: boolean
}

const pending = new Map<string, Promise<void>>()

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

export function injectScript(opts: InjectOptions): Promise<void> {
  if (!isBrowser()) return Promise.resolve()

  const key = opts.id ?? opts.src
  const existing = pending.get(key)
  if (existing) return existing

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = opts.src
    script.async = opts.async ?? true
    script.defer = opts.defer ?? false
    if (opts.id) script.id = opts.id
    if (opts.nonce) script.nonce = opts.nonce
    if (opts.partytown) script.type = "text/partytown"

    script.addEventListener("load", () => resolve())
    script.addEventListener("error", () =>
      reject(new ScriptLoadError(`Failed to load script: ${opts.src}`)),
    )

    const head = document.getElementsByTagName("script")[0]
    const parent = head?.parentNode as
      | { insertBefore(node: unknown, ref: unknown): void }
      | null
      | undefined
    if (parent && head) {
      parent.insertBefore(script, head)
    } else {
      ;(document.head as { appendChild(node: unknown): void }).appendChild(script)
    }
  })

  pending.set(key, promise)
  return promise
}

export function removeScript(id: string): void {
  if (!isBrowser()) return
  pending.delete(id)
  const el = document.getElementById(id)
  el?.remove()
}

export function readCspNonce(): string | undefined {
  if (!isBrowser()) return undefined
  const current = document.currentScript
  return current?.nonce || undefined
}
