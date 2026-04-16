export interface Visitor {
  id?: string;
  email?: string;
  name?: string;
  phone?: string;
  createdAt?: number;
  [key: string]: unknown;
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

export interface LoadOptions {
  appId?: string;
  key?: string;
  id?: string;
  src?: string;
  autoShow?: boolean;
}

export type ProviderName = "intercom" | "crisp" | "tawk" | "zendesk" | "hubspot" | "chatwoot";
