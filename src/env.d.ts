// Minimal runtime globals shared by ahize providers.
declare var window:
  | {
      [key: string]: unknown
      document: Document
      addEventListener?: (type: string, listener: (event: unknown) => void, opts?: unknown) => void
      removeEventListener?: (
        type: string,
        listener: (event: unknown) => void,
        opts?: unknown,
      ) => void
    }
  | undefined

interface Event {
  type: string
  detail?: unknown
}

declare var document: Document
declare var location: { pathname: string; search: string; href: string; hostname: string }

interface Document {
  createElement(tag: "script"): HTMLScriptElement
  head: { appendChild(node: unknown): void }
  getElementById(id: string): HTMLScriptElement | null
  getElementsByTagName(tag: string): ArrayLike<HTMLScriptElement>
  querySelectorAll(selector: string): ArrayLike<HTMLScriptElement>
  currentScript: HTMLScriptElement | null
  addEventListener(type: string, listener: (event: Event) => void, opts?: unknown): void
  removeEventListener(type: string, listener: (event: Event) => void, opts?: unknown): void
}

interface HTMLScriptElement {
  src: string
  async: boolean
  defer: boolean
  type: string
  id: string
  nonce: string
  charset: string
  addEventListener(type: "load" | "error", listener: () => void): void
  parentNode: { insertBefore(node: unknown, ref: unknown): void } | null
  remove(): void
}

interface Storage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
}
