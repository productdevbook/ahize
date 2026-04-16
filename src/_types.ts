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

export interface BaseLoadOptions {
  nonce?: string;
  autoShow?: boolean;
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
  | "smartsupp";
