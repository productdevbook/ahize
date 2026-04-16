export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type EventMetadata = Readonly<Record<string, JsonValue>>;

export interface Visitor {
  id?: string;
  email?: string;
  name?: string;
  phone?: string;
  createdAt?: number;
  attributes?: EventMetadata;
}

export type Verification =
  | { kind: "hmac"; hash: string }
  | { kind: "jwt"; token: string }
  | { kind: "callback"; getToken: () => string | Promise<string> };

export interface Identity extends Visitor {
  verification?: Verification;
}

export type IdentityState = { kind: "anonymous" } | { kind: "identified"; identity: Identity };

export type IdentityListener = (next: IdentityState, prev: IdentityState) => void;

export type DeferStrategy = "immediate" | "idle" | "interaction" | "manual";

export interface BaseLoadOptions {
  nonce?: string;
  autoShow?: boolean;
  /**
   * When to actually inject the CDN script:
   * - "immediate" (default): inject right away
   * - "idle": requestIdleCallback + 200ms fallback
   * - "interaction": first pointerdown/scroll/keydown/touchstart
   * - "manual": the returned Promise never resolves; consumer must call resume()
   */
  defer?: DeferStrategy;
  /** Consent gate. If false, load() resolves without injecting. Default: true. */
  consent?: boolean;
  /** Inject script as `<script type="text/partytown">` to offload to worker. */
  partytown?: boolean;
  /** zIndex for the launcher container; default 2147482647 (max - 1000). */
  zIndex?: number;
}

export interface LoadOptions extends BaseLoadOptions {
  appId?: string;
  key?: string;
  id?: string;
  src?: string;
}

export type ProviderName =
  | "intercom"
  | "crisp"
  | "tawk"
  | "zendesk"
  | "hubspot"
  | "chatwoot"
  | "livechat"
  | "drift"
  | "freshchat"
  | "olark"
  | "userlike"
  | "helpscout"
  | "smartsupp"
  | "liveagent"
  | "gist"
  | "jivochat"
  | "tidio"
  | "sendbird";
