// Partytown adapter — sugar around the existing `partytown` flag on every
// provider's load(). Use this when you want the provider's CDN script to run
// in a worker via Builder's Partytown library.
//
// Setup:
//   1. Install @builder.io/partytown and add <PartytownScript /> to your <head>.
//   2. Forward the provider URL via Partytown's forward config:
//        forwardSettings([
//          'Intercom', 'intercomSettings',
//          'Tawk_API', 'Tawk_LoadStart',
//          // …
//        ])
//   3. Load with `partytown: true`.

import type { ProviderName } from "../_types.ts";

const FORWARD: Partial<Record<ProviderName, readonly string[]>> = {
  intercom: ["Intercom", "intercomSettings"],
  crisp: ["$crisp", "CRISP_WEBSITE_ID", "CRISP_TOKEN_ID", "CRISP_RUNTIME_CONFIG"],
  tawk: ["Tawk_API", "Tawk_LoadStart"],
  zendesk: ["zE", "zESettings"],
  hubspot: ["HubSpotConversations", "hsConversationsSettings", "hsConversationsOnReady", "_hsq"],
  chatwoot: ["chatwootSDK", "$chatwoot", "chatwootSettings"],
  livechat: ["__lc", "LiveChatWidget"],
  drift: ["drift", "driftt"],
  freshchat: ["fcWidget", "fcSettings"],
  olark: ["olark"],
  userlike: ["userlikeMessenger"],
  helpscout: ["Beacon"],
  smartsupp: ["smartsupp", "_smartsupp"],
  liveagent: ["LiveAgent"],
  gist: ["gist", "gistAppId"],
  jivochat: [
    "jivo_api",
    "jivo_onLoadCallback",
    "jivo_onOpen",
    "jivo_onClose",
    "jivo_onMessageSent",
  ],
  tidio: ["tidioChatApi"],
  sendbird: ["__sb_widget_settings"],
};

/**
 * Returns the list of `forwardSettings` Partytown needs for a given provider.
 * Pass these (flat-spread across providers) into the @builder.io/partytown
 * <PartytownScript forward={...} />.
 */
export function partytownForward(...providers: ProviderName[]): string[] {
  const out = new Set<string>();
  for (const p of providers) for (const k of FORWARD[p] ?? []) out.add(k);
  return [...out];
}

/**
 * Convenience: returns a PartytownConfig fragment ready to merge into the
 * Partytown script tag's `data-config` attribute.
 */
export function partytownConfig(...providers: ProviderName[]): { forward: string[] } {
  return { forward: partytownForward(...providers) };
}
