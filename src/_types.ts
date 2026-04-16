/** Any value that survives `JSON.stringify` without data loss. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/** Payload shape for `track()` events — a JSON-serialisable record. */
export type EventMetadata = Readonly<Record<string, JsonValue>>

/** Basic visitor facts every provider understands. `attributes` holds
 *  provider-specific custom fields. */
export interface Visitor {
  id?: string
  email?: string
  name?: string
  phone?: string
  createdAt?: number
  attributes?: EventMetadata
}

/** Server-issued proof that the visitor is who they claim to be. The
 *  provider determines which kinds are accepted (some want HMAC, some
 *  JWT, some a refreshable callback). */
export type Verification =
  | { kind: "hmac"; hash: string }
  | { kind: "jwt"; token: string }
  | { kind: "callback"; getToken: () => string | Promise<string> }

/** A `Visitor` plus optional server-issued verification proof. */
export interface Identity extends Visitor {
  verification?: Verification
}

/** Current identity snapshot — anonymous until `identify()` succeeds. */
export type IdentityState = { kind: "anonymous" } | { kind: "identified"; identity: Identity }

/** Listener signature for `onIdentityChange()`. */
export type IdentityListener = (next: IdentityState, prev: IdentityState) => void

/** Script-injection scheduling:
 * - `"immediate"` (default) — inject right away
 * - `"idle"` — `requestIdleCallback` with a 200ms fallback
 * - `"interaction"` — first pointerdown / scroll / keydown / touchstart
 * - `"manual"` — never inject unless the consumer calls load() again
 */
export type DeferStrategy = "immediate" | "idle" | "interaction" | "manual"

/** Options shared by every provider's `load()`. */
export interface BaseLoadOptions {
  /** CSP nonce forwarded to the injected script tag. */
  nonce?: string
  /** Auto-open the widget after load. */
  autoShow?: boolean
  /** When to actually inject the CDN script. See `DeferStrategy`. */
  defer?: DeferStrategy
  /** Consent gate — when `false`, `load()` resolves without injecting. Default: `true`. */
  consent?: boolean
  /** Inject as `<script type="text/partytown">` to offload to a worker. */
  partytown?: boolean
  /** z-index for the launcher container. Default: `2147482647` (max − 1000). */
  zIndex?: number
}

/** Superset of `BaseLoadOptions` with the common provider-keying fields
 *  (each provider refines its own `Load<Provider>Options`). */
export interface LoadOptions extends BaseLoadOptions {
  appId?: string
  key?: string
  id?: string
  src?: string
}

/** Union of every bundled provider sub-path (minus the `ahize/` prefix). */
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
  | "sendbird"
