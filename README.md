<p align="center">
  <br>
  <img src=".github/assets/cover.png" alt="ahize" width="100%">
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

```diff
-import * as chat from "ahize/intercom";
-await chat.load({ appId: "abc" });
+import * as chat from "ahize/crisp";
+await chat.load({ websiteId: "uuid" });

// every other line stays the same
chat.identify({ id: "u1", email: "ada@example.com" });
chat.track("plan_upgraded", { tier: "pro" });
chat.show();
```

## Install

```sh
npm install ahize
# pnpm add ahize / yarn add ahize / bun add ahize
```

## Hello, world

```ts
import { load, identify, track, show } from "ahize/intercom";

await load({ appId: "abc123" });
await identify({
  id: "user_1",
  email: "ada@example.com",
  name: "Ada Lovelace",
});
await track("plan_upgraded", { tier: "pro" });
await show();
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

## Identity verification

Most providers want a server-issued HMAC or JWT to prevent users from
spoofing each other's profiles. `ahize` makes it a typed required field:

```ts
// Intercom — HMAC of user_id with your app secret
await identify({
  id: "user_1",
  email: "ada@example.com",
  verification: { kind: "hmac", hash: process.env.INTERCOM_USER_HASH! },
});

// HubSpot — JWT
await identify({
  id: "user_1",
  email: "ada@example.com",
  verification: { kind: "jwt", token: serverIssuedJwt },
});

// Zendesk Messenger — callback for token refresh on 401
await identify({
  id: "user_1",
  verification: {
    kind: "callback",
    getToken: async () => fetchFreshJwtFromServer(),
  },
});
```

Pass the wrong `kind` for a provider and you get a typed rejection — no
silent drop. See `ahize/capabilities` for who supports what.

## SSR

`ahize` is safe to import from any server runtime. Every method
short-circuits when `window`/`document` are unavailable, so this works
in Next.js App Router, Nuxt 3, Remix, SvelteKit, Astro, and Cloudflare
Workers without guards.

```ts
// app/layout.tsx — no "use client" needed for the import itself
import { load } from "ahize/intercom";

await load({ appId: "..." }); // resolves to undefined on the server, no-op
```

If you want to be belt-and-braces sure no DOM code enters your SSR
bundle, import the matching no-op stub:

```ts
import { load, identify, track } from "ahize/server";
```

## Framework adapters

Each adapter is framework-agnostic — bring your own React/Vue/Angular,
no peer dependencies.

### Next.js (App Router)

```tsx
"use client";
import * as React from "react";
import * as intercom from "ahize/intercom";
import { createAhizeComponent } from "ahize/next";
import { usePathname, useSearchParams } from "next/navigation";

const Ahize = createAhizeComponent(React, { usePathname, useSearchParams });

export default function ChatBoot() {
  return <Ahize provider={intercom} options={{ appId: "abc123" }} autoPageView />;
}
```

Mount once in your root layout. `pageView()` auto-fires on every route
change — fixes HubSpot's targeting rules, keeps Intercom's session
tracking accurate.

### Nuxt 3

```ts
// plugins/ahize.client.ts
import { defineNuxtPlugin } from "#app";
import * as intercom from "ahize/intercom";
import { createNuxtAhizePlugin } from "ahize/nuxt";

export default defineNuxtPlugin(
  createNuxtAhizePlugin({
    provider: intercom,
    options: { appId: "abc123" },
    autoPageView: true,
  }),
);
```

### React (any meta-framework)

```tsx
import * as React from "react";
import * as crisp from "ahize/crisp";
import { createUseAhize } from "ahize/react";

const useAhize = createUseAhize(React);

function App() {
  const { isReady, identify, show } = useAhize({
    provider: crisp,
    options: { websiteId: "..." },
  });

  return (
    <button disabled={!isReady} onClick={() => show()}>
      Open chat
    </button>
  );
}
```

### Vue 3, Svelte, SvelteKit, Remix, Astro, Angular

All shipped — see `ahize/vue`, `ahize/svelte`, `ahize/sveltekit`,
`ahize/remix`, `ahize/astro`, `ahize/angular`. Same factory pattern:
pass the framework primitives in.

## GDPR & consent

`load()` never fires on import. Pair it with your CMP:

```ts
import * as intercom from "ahize/intercom";

OneTrust.OnConsentChanged(() => {
  if (OnetrustActiveGroups.includes("C0004")) {
    intercom.load({ appId: "abc123" });
  } else {
    intercom.destroy(); // removes script, globals, cookies
  }
});
```

Defer strategies for LCP-sensitive pages:

```ts
load({ appId: "...", defer: "idle" }); // requestIdleCallback
load({ appId: "...", defer: "interaction" }); // first pointerdown/scroll/keydown
load({ appId: "...", defer: "manual" }); // never auto-injects
load({ appId: "...", consent: hasConsent }); // gate behind a flag
```

EU region selection is built in:

```ts
intercom.load({ appId: "...", region: "eu" }); // → api-iam.eu.intercom.io
hubspot.load({ portalId: "...", region: "eu1" }); // → js-eu1.hs-scripts.com
```

## CSP

Strict CSP breaks every chat widget by default. `ahize/csp` ships the
exact directive list per provider, including the WSS endpoints
competitor wrappers always forget:

```ts
import { cspDirectives, mergeCsp, toHeaderString } from "ahize/csp";

const policy = mergeCsp(
  cspDirectives("intercom"),
  cspDirectives("crisp"),
  cspDirectives("chatwoot", { chatwootBaseUrl: "https://chat.acme.com" }),
);

response.setHeader("Content-Security-Policy", toHeaderString(policy));
```

Pass a nonce through `load()` and the same nonce through your CSP:

```ts
load({ appId: "...", nonce: cspNonce });
```

Want to catch violations in dev?

```ts
import { watchCspViolations } from "ahize/csp";

watchCspViolations((event) => {
  console.warn("CSP blocked", event.blockedURI, "for", event.violatedDirective);
});
```

## Facade mode

For pages where chat is below the fold and LCP matters, mount a tiny
launcher. The real provider boots on hover or click:

```ts
import * as intercom from "ahize/intercom";
import { mountFacade } from "ahize/facade";

mountFacade({
  provider: "intercom",
  boot: () => intercom.load({ appId: "abc123" }),
});
```

Under 2 KB. No CSS file, no framework. The launcher removes itself once
the real widget is ready.

## Switching providers

Capability matrix is queryable so you don't hard-code branches:

```ts
import { capabilities, supports } from "ahize/capabilities";

if (supports("zendesk", "callback")) {
  await identify({ id: "u1", verification: { kind: "callback", getToken } });
} else if (supports("zendesk", "jwt")) {
  await identify({ id: "u1", verification: { kind: "jwt", token } });
}
```

## Diagnostics

When the snippet refuses to load, `ahize/diagnostics` probes the CDN and
returns a hint:

```ts
import { diagnose } from "ahize/diagnostics";

const result = await diagnose("intercom", { appId: "abc123" });
//   { ok: false, status: 404, hint: "Snippet not found — typo in id…" }
```

## Providers

| Provider        | Sub-path                | Identity              |
| --------------- | ----------------------- | --------------------- |
| Intercom        | `ahize/intercom`        | HMAC, JWT, regions    |
| Crisp           | `ahize/crisp`           | HMAC, hot-reconfig    |
| Tawk.to         | `ahize/tawk`            | HMAC                  |
| Zendesk         | `ahize/zendesk`         | JWT, callback         |
| Zendesk Classic | `ahize/zendesk-classic` | prefill               |
| HubSpot         | `ahize/hubspot`         | JWT, EU/US regions    |
| Chatwoot        | `ahize/chatwoot`        | HMAC, self-hosted     |
| LiveChat        | `ahize/livechat`        | —                     |
| Drift           | `ahize/drift`           | JWT                   |
| Freshchat       | `ahize/freshchat`       | JWT, EU/US regions    |
| Olark           | `ahize/olark`           | —                     |
| Userlike        | `ahize/userlike`        | Result&lt;ok, err&gt; |
| HelpScout       | `ahize/helpscout`       | HMAC                  |
| Smartsupp       | `ahize/smartsupp`       | —                     |
| LiveAgent       | `ahize/liveagent`       | self-hosted opt       |
| Gist            | `ahize/gist`            | HMAC                  |
| JivoChat        | `ahize/jivochat`        | rate-limited          |
| Tidio           | `ahize/tidio`           | —                     |
| Sendbird        | `ahize/sendbird`        | session token         |

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

## Contributing

Issues and PRs welcome at
[github.com/productdevbook/ahize](https://github.com/productdevbook/ahize).
Missing a provider? The pattern is small enough to copy from any
existing one — `src/providers/livechat.ts` is a good minimal template.

## License

[MIT](./LICENSE) © [productdevbook](https://github.com/productdevbook)
