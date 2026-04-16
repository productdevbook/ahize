// Capability matrix — per-provider feature flags so consumers can
// programmatically pick the right provider, or short-circuit code paths
// when a capability isn't supported.

import type { ProviderName } from "./_types.ts"

export interface ProviderCapabilities {
  /** Identity verification supported (HMAC, JWT, callback). */
  hmac: boolean
  jwt: boolean
  callback: boolean
  /** Per-message tracking. */
  trackEvents: boolean
  /** Native unread-count callback. */
  unreadCount: boolean
  /** prefill() programmatic compose. */
  prefill: boolean
  /** setLocale at runtime (no remount). */
  setLocale: boolean
  /** setTheme at runtime. */
  setTheme: boolean
  /** Self-hosted base URL override. */
  selfHosted: boolean
  /** Per-region selection (EU/US/AU). */
  regions: boolean
}

const NONE: ProviderCapabilities = {
  hmac: false,
  jwt: false,
  callback: false,
  trackEvents: false,
  unreadCount: false,
  prefill: false,
  setLocale: false,
  setTheme: false,
  selfHosted: false,
  regions: false,
}

const TABLE: Record<ProviderName, ProviderCapabilities> = {
  intercom: { ...NONE, hmac: true, jwt: true, trackEvents: true, unreadCount: true, regions: true },
  crisp: { ...NONE, hmac: true, trackEvents: true, unreadCount: true, setLocale: true },
  tawk: { ...NONE, hmac: true, trackEvents: true, unreadCount: true },
  zendesk: {
    ...NONE,
    jwt: true,
    callback: true,
    trackEvents: true,
    unreadCount: true,
    setLocale: true,
  },
  hubspot: { ...NONE, jwt: true, trackEvents: true, unreadCount: true, regions: true },
  chatwoot: {
    ...NONE,
    hmac: true,
    trackEvents: true,
    unreadCount: true,
    setLocale: true,
    setTheme: true,
    selfHosted: true,
  },
  livechat: { ...NONE, trackEvents: true },
  drift: { ...NONE, jwt: true, trackEvents: true },
  freshchat: { ...NONE, jwt: true, trackEvents: true, regions: true },
  olark: { ...NONE, trackEvents: true },
  userlike: { ...NONE, trackEvents: true, setLocale: true },
  helpscout: { ...NONE, hmac: true, trackEvents: true, prefill: true },
  smartsupp: { ...NONE, trackEvents: true },
  liveagent: { ...NONE, selfHosted: true },
  gist: { ...NONE, hmac: true, trackEvents: true },
  jivochat: NONE,
  tidio: { ...NONE, trackEvents: true },
  sendbird: NONE,
}

export function capabilities(provider: ProviderName): ProviderCapabilities {
  return TABLE[provider]
}

export function supports(provider: ProviderName, feature: keyof ProviderCapabilities): boolean {
  return TABLE[provider][feature]
}
