/**
 * Content-Security-Policy helpers — per-provider connect-src /
 * script-src / img-src directives, plus merge utilities.
 *
 * @module
 */
import type { ProviderName } from "./_types.ts"

/** Every CSP directive key ahize knows how to emit. */
export type CspDirectiveKey =
  | "script-src"
  | "connect-src"
  | "frame-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "media-src"

/** A ready-to-serialise CSP directive set, one entry per key. */
export type CspDirectives = Record<CspDirectiveKey, readonly string[]>

const EMPTY: CspDirectives = {
  "script-src": [],
  "connect-src": [],
  "frame-src": [],
  "style-src": [],
  "img-src": [],
  "font-src": [],
  "media-src": [],
}

const CATALOG: Partial<Record<ProviderName, CspDirectives>> = {
  intercom: {
    "script-src": ["https://widget.intercom.io", "https://js.intercomcdn.com"],
    "connect-src": [
      "https://api-iam.intercom.io",
      "https://api-ping.intercom.io",
      "https://nexus-websocket-a.intercom.io",
      "https://nexus-websocket-b.intercom.io",
      "wss://nexus-websocket-a.intercom.io",
      "wss://nexus-websocket-b.intercom.io",
      "https://uploads.intercomcdn.com",
      "https://uploads.intercomusercontent.com",
    ],
    "frame-src": ["https://intercom-sheets.com", "https://www.intercom-reporting.com"],
    "style-src": ["https://fonts.intercomcdn.com"],
    "img-src": ["https://js.intercomcdn.com", "https://static.intercomassets.com"],
    "font-src": ["https://fonts.intercomcdn.com"],
    "media-src": ["https://js.intercomcdn.com"],
  },
  crisp: {
    "script-src": ["https://client.crisp.chat"],
    "connect-src": [
      "https://client.crisp.chat",
      "https://client.relay.crisp.chat",
      "wss://client.relay.crisp.chat",
      "https://storage.crisp.chat",
    ],
    "frame-src": ["https://game.crisp.chat"],
    "style-src": ["https://client.crisp.chat"],
    "img-src": [
      "https://client.crisp.chat",
      "https://image.crisp.chat",
      "https://storage.crisp.chat",
    ],
    "font-src": ["https://client.crisp.chat"],
    "media-src": ["https://client.crisp.chat"],
  },
  tawk: {
    "script-src": ["https://embed.tawk.to", "https://*.tawk.to"],
    "connect-src": ["https://*.tawk.to", "wss://*.tawk.to"],
    "frame-src": ["https://*.tawk.to"],
    "style-src": ["https://embed.tawk.to"],
    "img-src": ["https://*.tawk.to", "https://*.tawkcdn.com"],
    "font-src": ["https://embed.tawk.to"],
    "media-src": ["https://*.tawkcdn.com"],
  },
  zendesk: {
    "script-src": ["https://static.zdassets.com", "https://ekr.zdassets.com"],
    "connect-src": [
      "https://*.zendesk.com",
      "https://*.zopim.com",
      "https://ekr.zdassets.com",
      "https://static.zdassets.com",
      "wss://widget-mediator.zopim.com",
      "wss://*.zopim.com",
    ],
    "frame-src": ["https://*.zendesk.com", "https://*.zopim.com"],
    "style-src": ["https://static.zdassets.com"],
    "img-src": ["https://*.zdassets.com", "https://*.zendesk.com", "https://*.zopim.com"],
    "font-src": ["https://static.zdassets.com"],
    "media-src": ["https://*.zendesk.com"],
  },
  hubspot: {
    "script-src": [
      "https://js.hs-scripts.com",
      "https://js-eu1.hs-scripts.com",
      "https://js.hs-analytics.net",
      "https://js.hs-banner.com",
      "https://js.usemessages.com",
      "https://js.hsforms.net",
      "https://js.hs-scripts.com",
      "https://js.hubspot.com",
    ],
    "connect-src": [
      "https://*.hubspot.com",
      "https://*.hubapi.com",
      "https://*.hs-analytics.net",
      "https://api.hubspot.com",
      "https://api.hubapi.com",
      "wss://*.hubspot.com",
    ],
    "frame-src": ["https://app.hubspot.com", "https://*.hubspot.com"],
    "style-src": ["https://*.hubspot.com", "https://*.hsforms.net"],
    "img-src": ["https://*.hubspot.com", "https://*.hs-analytics.net", "https://track.hubspot.com"],
    "font-src": ["https://*.hubspot.com", "https://fonts.hubspot.com"],
    "media-src": ["https://*.hubspot.com"],
  },
  chatwoot: {
    "script-src": [],
    "connect-src": [],
    "frame-src": [],
    "style-src": [],
    "img-src": [],
    "font-src": [],
    "media-src": [],
  },
}

/** Tuning knobs for `cspDirectives()`. */
export interface CspOptions {
  /** Include 'self' in each directive. Default: true. */
  includeSelf?: boolean
  /** Override Chatwoot host for self-hosted directives. */
  chatwootBaseUrl?: string
}

/** Build the CSP directive set a given provider needs. For self-hosted
 *  Chatwoot pass `options.chatwootBaseUrl`. */
export function cspDirectives(provider: ProviderName, options?: CspOptions): CspDirectives {
  const includeSelf = options?.includeSelf ?? true
  const base = CATALOG[provider] ?? EMPTY

  if (provider === "chatwoot") {
    const baseUrl = options?.chatwootBaseUrl?.replace(/\/+$/, "") ?? "https://app.chatwoot.com"
    const host = new URL(baseUrl).host
    const wss = `wss://${host}/cable`
    const directives: CspDirectives = {
      "script-src": [baseUrl],
      "connect-src": [baseUrl, wss],
      "frame-src": [baseUrl],
      "style-src": [baseUrl],
      "img-src": [baseUrl],
      "font-src": [baseUrl],
      "media-src": [baseUrl],
    }
    return withSelf(directives, includeSelf)
  }

  return withSelf(base, includeSelf)
}

function withSelf(directives: CspDirectives, includeSelf: boolean): CspDirectives {
  if (!includeSelf) return directives
  const out = {} as CspDirectives
  for (const key of Object.keys(directives) as CspDirectiveKey[]) {
    out[key] = ["'self'", ...directives[key]]
  }
  return out
}

/** Serialise a `CspDirectives` object to a Content-Security-Policy header string. */
export function toHeaderString(directives: CspDirectives): string {
  const parts: string[] = []
  for (const key of Object.keys(directives) as CspDirectiveKey[]) {
    const values = directives[key]
    if (values.length > 0) parts.push(`${key} ${values.join(" ")}`)
  }
  return parts.join("; ")
}

/** Union-merge any number of `CspDirectives` sets, de-duplicating values. */
export function mergeCsp(...sets: CspDirectives[]): CspDirectives {
  const out = {} as CspDirectives
  const allKeys: CspDirectiveKey[] = [
    "script-src",
    "connect-src",
    "frame-src",
    "style-src",
    "img-src",
    "font-src",
    "media-src",
  ]
  for (const key of allKeys) {
    const merged = new Set<string>()
    for (const set of sets) for (const v of set[key]) merged.add(v)
    out[key] = [...merged]
  }
  return out
}

/** Subscribe to browser `securitypolicyviolation` events — useful for
 *  discovering which hosts your CSP is blocking during development. */
export function watchCspViolations(
  handler: (event: SecurityPolicyViolationEvent) => void,
): () => void {
  if (typeof window === "undefined") return () => {}
  const cast = handler as () => void
  window.addEventListener?.("securitypolicyviolation", cast)
  return () => window?.removeEventListener?.("securitypolicyviolation", cast)
}

interface SecurityPolicyViolationEvent {
  blockedURI: string
  violatedDirective: string
  effectiveDirective: string
  originalPolicy: string
}
