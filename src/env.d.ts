// Minimal runtime globals shared by ahize providers.
declare var window:
  | {
      [key: string]: unknown;
      document: Document;
    }
  | undefined;

declare var document: Document;

interface Document {
  createElement(tag: "script"): HTMLScriptElement;
  head: { appendChild(node: unknown): void };
  getElementsByTagName(tag: string): ArrayLike<HTMLScriptElement>;
}

interface HTMLScriptElement {
  src: string;
  async: boolean;
  defer: boolean;
  type: string;
  id: string;
  charset: string;
  addEventListener(type: "load" | "error", listener: () => void): void;
  parentNode: { insertBefore(node: unknown, ref: unknown): void } | null;
}
