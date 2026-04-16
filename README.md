<p align="center">
  <br>
  <img src=".github/assets/cover.png" alt="ahize — Zero-dependency live chat & customer support widgets (unified API)" width="100%">
  <br><br>
  <b style="font-size: 2em;">ahize</b>
  <br><br>
  Zero-dependency TypeScript wrappers for live chat & customer support widgets.
  <br>
  Unified API over 18 providers. Tree-shakeable, SSR-safe, CSP-aware.
  <br><br>
  <a href="https://npmjs.com/package/ahize"><img src="https://img.shields.io/npm/v/ahize?style=flat&colorA=18181B&colorB=F0DB4F" alt="npm version"></a>
  <a href="https://npmjs.com/package/ahize"><img src="https://img.shields.io/npm/dm/ahize?style=flat&colorA=18181B&colorB=F0DB4F" alt="npm downloads"></a>
  <a href="https://bundlephobia.com/result?p=ahize"><img src="https://img.shields.io/bundlephobia/minzip/ahize?style=flat&colorA=18181B&colorB=F0DB4F" alt="bundle size"></a>
  <a href="https://github.com/productdevbook/ahize/blob/main/LICENSE"><img src="https://img.shields.io/github/license/productdevbook/ahize?style=flat&colorA=18181B&colorB=F0DB4F" alt="license"></a>
</p>

## Quick Start

```sh
npm install ahize
```

```ts
import { load, identify, track, show } from "ahize/intercom";

await load({ appId: "abc123" });
identify({ id: "user_1", email: "ada@example.com" });
track("plan_upgraded", { tier: "pro" });
show();
```

Every provider exposes the same surface:

```ts
load(options); // inject CDN & boot (queue-before-load)
identify(identity); // typed Identity with verification: hmac | jwt | callback
track(event, metadata?); // generic <T extends EventMetadata>
pageView({ path?, locale? }); // SPA route notification
show(); hide(); // toggle widget
shutdown(); // end session, keep config
destroy(); // hard reset (script, globals, listeners)
ready(); // Promise resolved when widget API attaches
isReady(); state(); // sync state machine
onIdentityChange(cb); // identity transitions
```

## Providers

| Provider        | Import path             | Identity           |
| --------------- | ----------------------- | ------------------ |
| Intercom        | `ahize/intercom`        | HMAC, JWT, regions |
| Crisp           | `ahize/crisp`           | HMAC, hot-reconfig |
| Tawk.to         | `ahize/tawk`            | HMAC               |
| Zendesk         | `ahize/zendesk`         | JWT, callback      |
| Zendesk Classic | `ahize/zendesk-classic` | prefill            |
| HubSpot         | `ahize/hubspot`         | JWT, EU/US regions |
| Chatwoot        | `ahize/chatwoot`        | HMAC, self-hosted  |
| LiveChat        | `ahize/livechat`        | —                  |
| Drift           | `ahize/drift`           | JWT                |
| Freshchat       | `ahize/freshchat`       | JWT, EU/US regions |
| Olark           | `ahize/olark`           | —                  |
| Userlike        | `ahize/userlike`        | Result<ok, err>    |
| HelpScout       | `ahize/helpscout`       | HMAC               |
| Smartsupp       | `ahize/smartsupp`       | —                  |
| LiveAgent       | `ahize/liveagent`       | self-hosted opt    |
| Gist            | `ahize/gist`            | HMAC               |
| JivoChat        | `ahize/jivochat`        | rate-limited       |
| Tidio           | `ahize/tidio`           | —                  |
| Sendbird        | `ahize/sendbird`        | session token      |

## Helpers

| Sub-path             | What                                          |
| -------------------- | --------------------------------------------- |
| `ahize`              | Core types & primitives (`createQueue`, etc.) |
| `ahize/server`       | SSR-safe stub (every method is a typed no-op) |
| `ahize/csp`          | Per-provider CSP directive catalog            |
| `ahize/facade`       | <2KB launcher that boots provider on click    |
| `ahize/capabilities` | Programmatic feature matrix                   |
| `ahize/diagnostics`  | Dev-mode CDN probe with actionable hints      |

## Framework adapters

| Sub-path          | What                                           |
| ----------------- | ---------------------------------------------- |
| `ahize/next`      | App Router + Pages Router component            |
| `ahize/nuxt`      | Nuxt 3 plugin factory                          |
| `ahize/vue`       | Vue 3 composable                               |
| `ahize/react`     | Framework-agnostic React hook                  |
| `ahize/svelte`    | Svelte store                                   |
| `ahize/sveltekit` | `afterNavigate` wiring                         |
| `ahize/remix`     | `useLocation`-based hook                       |
| `ahize/astro`     | Island integration + view-transitions          |
| `ahize/angular`   | Standalone-compatible service                  |
| `ahize/partytown` | `forwardSettings` helper for Builder Partytown |

## Why

- 🔌 **Unified API** — swap providers without rewriting app code
- 📦 **Zero runtime dependencies**
- 🌲 **Tree-shakeable** — only the sub-path you import ships
- 💪 **Strict TypeScript** — no `any`, generic `track<T>`, discriminated unions
- 🌍 **SSR-safe by construction** — no module-top-level `window` access
- 🔒 **CSP-aware** — nonce support + per-provider directive catalog
- 🍪 **GDPR-first** — `consent: false` short-circuits, defer strategies built in
- 🧊 **Queue-before-load** — pre-boot calls survive and drain in order
- ⚡ **Performance** — facade mode, idle/interaction defer, Partytown
- 🎯 **Identity state machine** — typed verification (HMAC/JWT/callback)

## License

[MIT](./LICENSE) © [productdevbook](https://github.com/productdevbook)
