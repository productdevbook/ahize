// Dev-mode diagnostics — call once during local development to surface
// common widget-script load failures (CORS, blocked URL, wrong key shape).
// Wraps fetch() with HEAD where possible so we don't accidentally double-load
// the snippet; falls back to script-tag probing when HEAD is blocked.

import { isBrowser } from "./_loader.ts";
import type { ProviderName } from "./_types.ts";

interface DiagnosticResult {
  provider: ProviderName;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  hint?: string;
}

const PROVIDER_PROBE: Partial<Record<ProviderName, (config: Record<string, string>) => string>> = {
  intercom: (c) => `https://widget.intercom.io/widget/${c["appId"] ?? ""}`,
  crisp: () => "https://client.crisp.chat/l.js",
  tawk: (c) => `https://embed.tawk.to/${c["propertyId"] ?? ""}/${c["widgetId"] ?? "default"}`,
  zendesk: (c) => `https://static.zdassets.com/ekr/snippet.js?key=${c["key"] ?? ""}`,
  hubspot: (c) =>
    `https://${c["region"] === "eu1" ? "js-eu1" : "js"}.hs-scripts.com/${c["portalId"] ?? ""}.js`,
  chatwoot: (c) => `${c["baseUrl"] ?? "https://app.chatwoot.com"}/packs/js/sdk.js`,
  livechat: () => "https://cdn.livechatinc.com/tracking.js",
  drift: (c) => `https://js.driftt.com/include/latest/${c["embedId"] ?? ""}.js`,
  freshchat: (c) => `${c["host"] ?? "https://wchat.freshchat.com"}/js/widget.js`,
  helpscout: () => "https://beacon-v2.helpscout.net",
  smartsupp: () => "https://www.smartsuppchat.com/loader.js",
  jivochat: (c) => `https://code.jivosite.com/widget/${c["widgetId"] ?? ""}`,
  tidio: (c) => `https://code.tidio.co/${c["publicKey"] ?? ""}.js`,
  gist: () => "https://widget.getgist.com",
  olark: (c) => `https://www.olark.com/r3s/loader.js?l=${c["siteId"] ?? ""}`,
  liveagent: (c) =>
    `${
      c["selfHostedBaseUrl"] ?? `https://${c["accountSubdomain"] ?? ""}.ladesk.com`
    }/scripts/track.js`,
  userlike: (c) =>
    `https://userlike-cdn-widgets.s3-eu-west-1.amazonaws.com/${c["messengerId"] ?? ""}.js`,
  sendbird: () => "https://aichatbot.sendbird.com/index.js",
};

interface FetchLike {
  (
    input: string,
    init?: { method?: string; mode?: string; redirect?: string },
  ): Promise<{ ok: boolean; status: number }>;
}

export async function diagnose(
  provider: ProviderName,
  config: Record<string, string>,
): Promise<DiagnosticResult> {
  if (!isBrowser()) {
    return { provider, url: "", ok: false, error: "not-in-browser" };
  }
  const builder = PROVIDER_PROBE[provider];
  if (!builder) {
    return { provider, url: "", ok: false, error: "no-probe-for-provider" };
  }
  const url = builder(config);
  const fetchFn = (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (!fetchFn) {
    return { provider, url, ok: false, error: "fetch-unavailable" };
  }
  try {
    const res = await fetchFn(url, { method: "HEAD", mode: "no-cors" });
    if (!res.ok && res.status !== 0) {
      let hint: string | undefined;
      if (res.status === 400) hint = "Likely wrong key/account/portalId — provider returned 400.";
      if (res.status === 403) hint = "Forbidden — verify domain whitelist on provider dashboard.";
      if (res.status === 404)
        hint = "Snippet not found — typo in id or provider deactivated account.";
      return { provider, url, ok: false, status: res.status, hint };
    }
    return { provider, url, ok: true, status: res.status };
  } catch (err) {
    return {
      provider,
      url,
      ok: false,
      error: String(err),
      hint: "Network/CORS blocked the probe. The actual <script> tag may still load fine — this is a best-effort dev check.",
    };
  }
}

export async function diagnoseAll(
  configs: Partial<Record<ProviderName, Record<string, string>>>,
): Promise<DiagnosticResult[]> {
  const entries = Object.entries(configs) as Array<[ProviderName, Record<string, string>]>;
  return Promise.all(entries.map(([p, c]) => diagnose(p, c)));
}
