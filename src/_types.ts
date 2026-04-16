export interface Visitor {
  id?: string;
  email?: string;
  name?: string;
  phone?: string;
  createdAt?: number;
  [key: string]: unknown;
}

export interface LoadOptions {
  appId?: string;
  key?: string;
  id?: string;
  src?: string;
  autoShow?: boolean;
}

export type ProviderName =
  | "intercom"
  | "crisp"
  | "tawk"
  | "zendesk"
  | "hubspot";
