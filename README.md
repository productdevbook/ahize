<p align="center">
  <br>
  <img src="https://raw.githubusercontent.com/productdevbook/ahize/main/.github/assets/cover.png" alt="ahize" width="100%">
  <br><br>
  <b style="font-size: 2em;">ahize</b>
  <br><br>
  One unified API for 18 live-chat & customer-support widgets.
  <br>
  Zero dependencies. Tree-shakeable. SSR-safe. Strict TypeScript.
  <br><br>
  <a href="https://npmjs.com/package/ahize"><img src="https://img.shields.io/npm/v/ahize?style=flat&colorA=18181B&colorB=F0DB4F" alt="npm version"></a>
  <a href="https://npmjs.com/package/ahize"><img src="https://img.shields.io/npm/dm/ahize?style=flat&colorA=18181B&colorB=F0DB4F" alt="npm downloads"></a>
  <a href="https://bundlephobia.com/result?p=ahize"><img src="https://img.shields.io/bundlephobia/minzip/ahize?style=flat&colorA=18181B&colorB=F0DB4F" alt="bundle size"></a>
  <a href="https://github.com/productdevbook/ahize/blob/main/LICENSE"><img src="https://img.shields.io/github/license/productdevbook/ahize?style=flat&colorA=18181B&colorB=F0DB4F" alt="license"></a>
  <a href="https://github.com/sponsors/productdevbook"><img src="https://img.shields.io/github/sponsors/productdevbook?style=flat&colorA=18181B&colorB=F0DB4F&label=sponsors" alt="sponsors"></a>
</p>

## Why

Every live-chat vendor ships its own snippet, its own globals, its own
quirks. Wrappers exist for individual ones (`react-use-intercom`,
`react-zendesk`, `tawk-messenger-react`, …) — but each pulls in a
framework, locks you to one provider, and re-introduces the bugs the
underlying snippet already had: SSR crashes, calls dropped before boot,
HMAC fields silently missing, no `shutdown→boot` reversibility.

`ahize` is one zero-dependency layer over all of them. **Same surface,
swap providers by changing the import path.** Pre-boot calls are
buffered. Identity verification is typed. SSR is a no-op. CSP is
documented per provider.

Today you're on Intercom:

```ts
import * as chat from "ahize/intercom"

await chat.load({ appId: "abc" })
chat.identify({ id: "u1", email: "ada@example.com" })
chat.track("plan_upgraded", { tier: "pro" })
chat.show()
```

Tomorrow you switch to Crisp — only the import path and the `load()`
options change:

```ts
import * as chat from "ahize/crisp"

await chat.load({ websiteId: "uuid" })
chat.identify({ id: "u1", email: "ada@example.com" })
chat.track("plan_upgraded", { tier: "pro" })
chat.show()
```

## Install

```sh
npm install ahize
# pnpm add ahize / yarn add ahize / bun add ahize
```

## Hello, world

```ts
import { load, identify, track, show } from "ahize/intercom"

await load({ appId: "abc123" })
await identify({
  id: "user_1",
  email: "ada@example.com",
  name: "Ada Lovelace",
})
await track("plan_upgraded", { tier: "pro" })
await show()
```

That's it. The Intercom CDN is injected, `boot` is fired, and your
identify/track/show calls were buffered and drained in order.

## The unified surface

Every provider exports the exact same functions:

```ts
load(options); // inject CDN & boot — Promise resolves when widget API attaches
identify(identity); // set user; verification: hmac | jwt | callback
track(event, metadata?); // emit a custom event; generic <T extends EventMetadata>
pageView({ path, locale }); // notify on SPA route change
show();
hide(); // toggle widget visibility
shutdown(); // end session — keeps config so you can re-identify
destroy(); // hard reset — removes script, globals, listeners
ready(); // Promise<void> resolved once the real API is live
isReady();
state(); // synchronous lifecycle ('idle'|'loading'|'ready'|'shutdown')
getIdentity();
onIdentityChange(cb); // typed identity transitions
```

If you call any method before `load()` resolves, the call is queued and
flushed in order once the provider is ready. No more "Intercom is not
defined" warnings.

On top of the unified surface, most providers expose a typed
`on(event, handler)` for their documented lifecycle events (widget
open/close, message sent/received, conversation started, unread count,
…) and a handful of vendor-native methods — see the [Providers](#providers)
table for the per-provider extras.

## Identity verification

Most providers want a server-issued HMAC or JWT to prevent users from
spoofing each other's profiles. `ahize` makes it a typed required field:

```ts
// Intercom — HMAC of user_id with your app secret
await identify({
  id: "user_1",
  email: "ada@example.com",
  verification: { kind: "hmac", hash: process.env.INTERCOM_USER_HASH! },
})

// HubSpot — JWT
await identify({
  id: "user_1",
  email: "ada@example.com",
  verification: { kind: "jwt", token: serverIssuedJwt },
})

// Zendesk Messenger — callback for token refresh on 401
await identify({
  id: "user_1",
  verification: {
    kind: "callback",
    getToken: async () => fetchFreshJwtFromServer(),
  },
})
```

Pass the wrong `kind` for a provider and you get a typed rejection — no
silent drop. See `ahize/capabilities` for who supports what.

## SSR

`ahize` is safe to import from any server runtime. Every method
short-circuits when `window`/`document` are unavailable, so this works
in Next.js App Router, Nuxt 4, Remix, SvelteKit, Astro, and Cloudflare
Workers without guards.

```ts
// app/layout.tsx — no "use client" needed for the import itself
import { load } from "ahize/intercom"

await load({ appId: "..." }) // resolves to undefined on the server, no-op
```

If you want to be belt-and-braces sure no DOM code enters your SSR
bundle, import the matching no-op stub:

```ts
import { load, identify, track } from "ahize/server"
```

## Framework adapters

Each adapter is framework-agnostic — bring your own React/Vue/Angular,
no peer dependencies.

### Next.js (App Router)

```tsx
"use client"
import * as React from "react"
import * as intercom from "ahize/intercom"
import { createAhizeComponent } from "ahize/next"
import { usePathname, useSearchParams } from "next/navigation"

const Ahize = createAhizeComponent(React, { usePathname, useSearchParams })

export default function ChatBoot() {
  return <Ahize provider={intercom} options={{ appId: "abc123" }} autoPageView />
}
```

Mount once in your root layout. `pageView()` auto-fires on every route
change — fixes HubSpot's targeting rules, keeps Intercom's session
tracking accurate.

### Nuxt 4 (and Nuxt 3)

```ts
// app/plugins/ahize.client.ts   (Nuxt 4 default srcDir)
// plugins/ahize.client.ts       (Nuxt 3, or Nuxt 4 with custom srcDir)
import { defineNuxtPlugin } from "#app"
import * as intercom from "ahize/intercom"
import { createNuxtAhizePlugin } from "ahize/nuxt"

export default defineNuxtPlugin(
  createNuxtAhizePlugin({
    provider: intercom,
    options: { appId: "abc123" },
    autoPageView: true,
  }),
)
```

The plugin & `defineNuxtPlugin` API is identical between Nuxt 3 and 4 —
only the default source directory changed (`app/` in Nuxt 4). Use
`$ahize` from `useNuxtApp()` to access the provider in components.

### React (any meta-framework)

```tsx
import * as React from "react"
import * as crisp from "ahize/crisp"
import { createUseAhize } from "ahize/react"

const useAhize = createUseAhize(React)

function App() {
  const { isReady, identify, show } = useAhize({
    provider: crisp,
    options: { websiteId: "..." },
  })

  return (
    <button disabled={!isReady} onClick={() => show()}>
      Open chat
    </button>
  )
}
```

### Vue 3, Svelte, SvelteKit, Remix, Astro, Angular

All shipped — see `ahize/vue`, `ahize/svelte`, `ahize/sveltekit`,
`ahize/remix`, `ahize/astro`, `ahize/angular`. Same factory pattern:
pass the framework primitives in.

## GDPR & consent

`load()` never fires on import. Pair it with your CMP:

```ts
import * as intercom from "ahize/intercom"

OneTrust.OnConsentChanged(() => {
  if (OnetrustActiveGroups.includes("C0004")) {
    intercom.load({ appId: "abc123" })
  } else {
    intercom.destroy() // removes script, globals, cookies
  }
})
```

Defer strategies for LCP-sensitive pages:

```ts
load({ appId: "...", defer: "idle" }) // requestIdleCallback
load({ appId: "...", defer: "interaction" }) // first pointerdown/scroll/keydown
load({ appId: "...", defer: "manual" }) // never auto-injects
load({ appId: "...", consent: hasConsent }) // gate behind a flag
```

EU region selection is built in:

```ts
intercom.load({ appId: "...", region: "eu" }) // → api-iam.eu.intercom.io
hubspot.load({ portalId: "...", region: "eu1" }) // → js-eu1.hs-scripts.com
```

## CSP

Strict CSP breaks every chat widget by default. `ahize/csp` ships the
exact directive list per provider, including the WSS endpoints
competitor wrappers always forget:

```ts
import { cspDirectives, mergeCsp, toHeaderString } from "ahize/csp"

const policy = mergeCsp(
  cspDirectives("intercom"),
  cspDirectives("crisp"),
  cspDirectives("chatwoot", { chatwootBaseUrl: "https://chat.acme.com" }),
)

response.setHeader("Content-Security-Policy", toHeaderString(policy))
```

Pass a nonce through `load()` and the same nonce through your CSP:

```ts
load({ appId: "...", nonce: cspNonce })
```

Want to catch violations in dev?

```ts
import { watchCspViolations } from "ahize/csp"

watchCspViolations((event) => {
  console.warn("CSP blocked", event.blockedURI, "for", event.violatedDirective)
})
```

## Facade mode

For pages where chat is below the fold and LCP matters, mount a tiny
launcher. The real provider boots on hover or click:

```ts
import * as intercom from "ahize/intercom"
import { mountFacade } from "ahize/facade"

mountFacade({
  provider: "intercom",
  boot: () => intercom.load({ appId: "abc123" }),
})
```

Under 2 KB. No CSS file, no framework. The launcher removes itself once
the real widget is ready.

## Switching providers

Capability matrix is queryable so you don't hard-code branches:

```ts
import { capabilities, supports } from "ahize/capabilities"

if (supports("zendesk", "callback")) {
  await identify({ id: "u1", verification: { kind: "callback", getToken } })
} else if (supports("zendesk", "jwt")) {
  await identify({ id: "u1", verification: { kind: "jwt", token } })
}
```

## Diagnostics

When the snippet refuses to load, `ahize/diagnostics` probes the CDN and
returns a hint:

```ts
import { diagnose } from "ahize/diagnostics"

const result = await diagnose("intercom", { appId: "abc123" })
//   { ok: false, status: 404, hint: "Snippet not found — typo in id…" }
```

## Providers

Every provider ships the unified surface (`load` / `identify` / `track` /
`pageView` / `show` / `hide` / `shutdown` / `destroy` / `ready` / `isReady` /
`state` / `getIdentity` / `onIdentityChange`) plus a provider-specific
extension: `on(event, handler)` typed event bridge, and vendor-native
methods where they exist. Audited against live vendor docs 2026-04-16.

| Provider  | Sub-path          | Identity / regions                      | Provider-specific extras                                                                                                                                                        |
| --------- | ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intercom  | `ahize/intercom`  | HMAC, JWT, `us`/`eu`/`au`               | `showSpace`, `showNewMessage`, `startTour/Survey/Checklist`, `showArticle/News/Ticket`, `getVisitorId`, `onShow`/`onHide`/`onUserEmailSupplied`, 11 typed boot fields           |
| Crisp     | `ahize/crisp`     | HMAC, hot-reconfigure                   | `open`/`close`/`toggle`, `sendMessage`, `helpdeskSearch`, `setSessionSegments`, `setUserAvatar`, 13 events, runtime config                                                      |
| Tawk.to   | `ahize/tawk`      | HMAC, `login()` restores history        | `maximize`/`minimize`/`popup`, `addTags`/`removeTags`, `getStatus`/`isChat*`, visitor preload, 19 event hooks                                                                   |
| Zendesk   | `ahize/zendesk`   | JWT, callback                           | `open`/`close`, `setConversationTags`, `setCustomization`, `newConversation`, `resetWidget`, 13 `messenger:on` events, cookies/zIndex config                                    |
| Chatwoot  | `ahize/chatwoot`  | HMAC, self-hosted, settings             | `setColorScheme`, `deleteAttribute`, `popoutChatWindow`, `setLocale`, `setBubbleVisibility`, `on(opened/closed/postback/…)`, 11 typed settings                                  |
| HubSpot   | `ahize/hubspot`   | Identification token, `na1`/`eu1`/`ap1` | `on(conversationStarted/…)` (8 events), `status()`, `refresh`, 7 typed config (cookie banner, inline embed, attachment, CSP)                                                    |
| LiveChat  | `ahize/livechat`  | —                                       | `maximize(draft?)`, `minimize`, `hideGreeting`, `triggerSalesTracker`, `getState/CustomerData/ChatData`, 10 events, 7 typed `__lc` fields                                       |
| Freshchat | `ahize/freshchat` | JWT, `us`/`eu`/`in`/`au`                | `open`/`close`, `setLocale`, `setTags`/`setFaqTags`, `setBotVariables`, `trackPage`, `isOpen`/`isLoaded`, 16 events, 8 typed init fields                                        |
| Olark     | `ahize/olark`     | —                                       | `getVisitorDetails()`, `sendMessage/NotificationTo*`, `setOperatorGroup`, `setLocale`, 12 events, `group`/`locale` boot config                                                  |
| HelpScout | `ahize/helpscout` | HMAC                                    | `search`, `article`, `sessionData`, `config`, `reset`, `toggle`, `askQuestion`, `showMessage`, `info`, `once`, `prefill(attachments)`, full `BeaconConfig` object               |
| LiveAgent | `ahize/liveagent` | self-hosted opt                         | `addUserDetail`, `addTicketField`, `setVisitorLocation`, `createForm`, `hasOpenedWidget`, `on(chatStarted/chatEnded/online/offline)`                                            |
| Gist      | `ahize/gist`      | HMAC                                    | `open`/`close`, `showLauncher`/`hideLauncher`, `navigate`, `showArticle`, `trigger`, `setSidebar`/`setStandard`, 12 events                                                      |
| JivoChat  | `ahize/jivochat`  | `setUserToken` (verification)           | `setClientAttributes` (rate-limited), `setCustomData`, `startCall`, `sendOfflineMessage`, `sendPageTitle`, 12 events, sync `chatMode`/`getUnreadMessagesCount`/`getUtm`         |
| Smartsupp | `ahize/smartsupp` | —                                       | `open`/`close`, `prefillMessage`, `sendMessage`, `setGroup`, `setLanguage`, `getVisitorId`, `on(messageSent/Received/messengerClose)`, 12 typed `_smartsupp` fields             |
| Tidio     | `ahize/tidio`     | —                                       | `tidioChatApi.track` forwarding, `setColorPalette`, `display`, `messageFromOperator/Visitor`, `addVisitorTags`, `setVisitorCurrency`, 10 events, pre-load `language`/`identify` |

### Deprecated / sunset providers

Still functional but the underlying vendor has announced sunset / EOL.
Wrappers emit a one-shot `console.warn` on first `load()` and are marked
`@deprecated` in JSDoc. No new feature work planned.

| Provider        | Sub-path                | Status                                                                                                                           |
| --------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Drift           | `ahize/drift`           | Vendor sunset announced 2026-03-06 (Clari + Salesloft).                                                                          |
| Sendbird        | `ahize/sendbird`        | AI Chatbot Widget discontinued; repo archived 2025-07-09 at v1.9.7. Consider Sendbird Desk.                                      |
| Userlike        | `ahize/userlike`        | v1 CDN EOL **2026-08-01**. Vendor rebranded to Lime Connect; v2 is `@userlike/messenger` with a different surface.               |
| Zendesk Classic | `ahize/zendesk-classic` | Limited to Zendesk accounts created before 2023-06-05. Chat Web SDK removal started 2025-04-30. Use `ahize/zendesk` (Messenger). |

## Migrating

From `react-use-intercom`:

```diff
-import { IntercomProvider, useIntercom } from "react-use-intercom";
+import * as intercom from "ahize/intercom";
+import { createUseAhize } from "ahize/react";
+import * as React from "react";
+const useAhize = createUseAhize(React);

-<IntercomProvider appId="abc">{children}</IntercomProvider>
+const { isReady, identify, show, hide, shutdown } = useAhize({
+  provider: intercom,
+  options: { appId: "abc" },
+});
```

| react-use-intercom            | ahize                                                |
| ----------------------------- | ---------------------------------------------------- |
| `boot(props)`                 | `load({ appId, ...props })`                          |
| `update(props)`               | `identify(props)`                                    |
| `trackEvent(name, meta)`      | `track(name, meta)`                                  |
| `shutdown()`                  | `shutdown()`                                         |
| `hardShutdown()`              | `destroy()`                                          |
| `boot({ user_hash })`         | `identify({ verification: { kind: "hmac", hash } })` |
| `boot({ intercom_user_jwt })` | `identify({ verification: { kind: "jwt", token } })` |

Same shape works for `react-zendesk`, `tawk-messenger-react`,
`@productdevbook/chatwoot`, `@livechat/widget-react`. The notable change
across all of them: `ahize` separates **boot** (`load`) from **user
identity** (`identify`).

## Playground

A plain Vite + TypeScript playground is checked into `playground/` for
trying a real widget in the browser without setting up a framework.

```sh
pnpm playground
```

That installs the playground's own deps (vite, typescript) and opens the
dev server on `http://localhost:5173`. It imports the Chatwoot provider
directly from `../src/providers/chatwoot.ts`, so any code change in
`src/` reloads instantly — no build step. Paste your `websiteToken` (and
`baseUrl` if self-hosted), hit **load()**, then play with
identify/track/show/hide/setLocale and watch the event log.

## Sponsors

<p align="center">
  <a href="https://github.com/sponsors/productdevbook">
    <img src="https://cdn.jsdelivr.net/gh/productdevbook/static/sponsors.svg" alt="Sponsors of productdevbook" />
  </a>
</p>

If `ahize` saves you a few hours of live-chat integration pain, consider
[sponsoring on GitHub](https://github.com/sponsors/productdevbook) so
work on the next provider + framework adapter keeps going.

## Contributing

Issues and PRs welcome at
[github.com/productdevbook/ahize](https://github.com/productdevbook/ahize).
Missing a provider? The pattern is small enough to copy from any
existing one — `src/providers/livechat.ts` is a good minimal template.

## Credits

`ahize` exists because every one of these libraries solved part of the
problem and showed us the bugs to design around. Many of the design
decisions in `ahize` are direct responses to issues filed on these
projects — thank you to every maintainer and reporter.

**Intercom**

- [`devrnt/react-use-intercom`](https://github.com/devrnt/react-use-intercom) — the gold standard React wrapper; informed our queue-before-load contract and shutdown reversibility design
- [`nhagen/react-intercom`](https://github.com/nhagen/react-intercom) — early prior art for SSR-safe injection
- [`@intercom/messenger-js-sdk`](https://www.npmjs.com/package/@intercom/messenger-js-sdk) — Intercom's own typed helper

**Crisp**

- [`crisp-im/crisp-sdk-web`](https://github.com/crisp-im/crisp-sdk-web) — official wrapper; our `$crisp.push`-only contract comes from issues filed against it

**Tawk.to**

- [`tawk/tawk-messenger-react`](https://github.com/tawk/tawk-messenger-react) and [`tawk-messenger-vue-3`](https://github.com/tawk/tawk-messenger-vue-3) — typing gaps & switchWidget bug shaped our typed surface

**Zendesk**

- [`B3nnyL/react-zendesk`](https://github.com/B3nnyL/react-zendesk)
- [`dansmaculotte/vue-zendesk`](https://github.com/dansmaculotte/vue-zendesk) and [`nuxt-zendesk`](https://github.com/dansmaculotte/nuxt-zendesk) — defer & GDPR prior art
- [`multivoltage/react-use-zendesk`](https://github.com/multivoltage/react-use-zendesk) — JWT login flow patterns

**HubSpot**

- [`adamsoffer/react-hubspot`](https://github.com/adamsoffer/react-hubspot)
- [`aaronhayes/react-use-hubspot-form`](https://github.com/aaronhayes/react-use-hubspot-form) — EU region request that drove our region selector

**Chatwoot**

- [`chatwoot/chatwoot`](https://github.com/chatwoot/chatwoot) — the upstream widget SDK and every issue/PR against its window-event API
- [`@productdevbook/chatwoot`](https://github.com/productdevbook/chatwoot) — earlier work that informed `ahize/chatwoot`'s shape

**Performance & deferred load**

- [`calibreapp/react-live-chat-loader`](https://github.com/calibreapp/react-live-chat-loader) — the facade pattern, ported here as `ahize/facade`
- [`@builder.io/partytown`](https://github.com/BuilderIO/partytown) — worker offload, wired through `ahize/partytown`

**LiveChat (text.com)**

- [`livechat/chat-widget-adapters`](https://github.com/livechat/chat-widget-adapters) — official multi-framework reference (`@livechat/widget-react` etc.)

**Other providers**

- [`userlike/messenger`](https://github.com/userlike/messenger) — Result&lt;ok, err&gt; pattern we propagate
- HelpScout Beacon, Drift, Freshchat, Olark, Smartsupp, LiveAgent, Gist, JivoChat, Tidio, Sendbird — official docs & community wrappers

**Other unified-chat work**

- [`@dannyfranca/any-chat`](https://github.com/dannyfranca/any-chat) — earlier multi-provider experiment

If your library should be on this list and isn't,
[open an issue](https://github.com/productdevbook/ahize/issues) — happy
to credit.

## License

[MIT](./LICENSE) © [productdevbook](https://github.com/productdevbook)
