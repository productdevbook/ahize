// Minimal runtime globals shared by ahize providers.
declare var window:
  | {
      [key: string]: unknown;
      document: Document;
      addEventListener?: (type: string, listener: () => void, opts?: unknown) => void;
      removeEventListener?: (type: string, listener: () => void, opts?: unknown) => void;
    }
  | undefined;

declare var document: Document;
declare var location: { pathname: string; search: string; href: string; hostname: string };

interface Document {
  createElement(tag: "script"): HTMLScriptElement;
  head: { appendChild(node: unknown): void };
  getElementById(id: string): HTMLScriptElement | null;
  getElementsByTagName(tag: string): ArrayLike<HTMLScriptElement>;
  querySelectorAll(selector: string): ArrayLike<HTMLScriptElement>;
  currentScript: HTMLScriptElement | null;
}

interface HTMLScriptElement {
  src: string;
  async: boolean;
  defer: boolean;
  type: string;
  id: string;
  nonce: string;
  charset: string;
  addEventListener(type: "load" | "error", listener: () => void): void;
  parentNode: { insertBefore(node: unknown, ref: unknown): void } | null;
  remove(): void;
}
