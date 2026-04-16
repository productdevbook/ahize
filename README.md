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

## Install

```sh
npm install ahize
# or pnpm add ahize / yarn add ahize / bun add ahize
```

## Usage

```ts
import { load, identify, track, show } from "ahize/intercom";

await load({ appId: "abc123" });
await identify({ id: "user_1", email: "ada@example.com" });
await track("plan_upgraded", { tier: "pro" });
await show();
```

Switch to a different provider by changing one import — the surface is identical:

```ts
import { load, identify, track, show } from "ahize/crisp";

await load({ websiteId: "..." });
```

## API

Every provider exports the same shape:

```ts
load(options); // inject CDN, boot, queue any pre-load calls
identify(identity); // typed Identity { id, email, name, verification?: hmac|jwt|callback }
track(event, metadata?); // generic <T extends EventMetadata>
pageView({ path?, locale? }); // SPA route notification
show();
hide(); // toggle widget
shutdown(); // end session, keep config
destroy(); // hard reset (script, globals, listeners)
ready(); // Promise resolved when widget API attaches
isReady();
state(); // synchronous lifecycle state
getIdentity();
onIdentityChange(cb); // identity transitions
```

## Providers

| Provider        | Import path             |
| --------------- | ----------------------- |
| Intercom        | `ahize/intercom`        |
| Crisp           | `ahize/crisp`           |
| Tawk.to         | `ahize/tawk`            |
| Zendesk         | `ahize/zendesk`         |
| Zendesk Classic | `ahize/zendesk-classic` |
| HubSpot         | `ahize/hubspot`         |
| Chatwoot        | `ahize/chatwoot`        |
| LiveChat        | `ahize/livechat`        |
| Drift           | `ahize/drift`           |
| Freshchat       | `ahize/freshchat`       |
| Olark           | `ahize/olark`           |
| Userlike        | `ahize/userlike`        |
| HelpScout       | `ahize/helpscout`       |
| Smartsupp       | `ahize/smartsupp`       |
| LiveAgent       | `ahize/liveagent`       |
| Gist            | `ahize/gist`            |
| JivoChat        | `ahize/jivochat`        |
| Tidio           | `ahize/tidio`           |
| Sendbird        | `ahize/sendbird`        |

## Helpers

| Sub-path             | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `ahize`              | Core types & primitives                             |
| `ahize/server`       | SSR-safe stub — every method is a typed no-op       |
| `ahize/csp`          | Per-provider CSP directive catalog (incl. WSS)      |
| `ahize/facade`       | Lightweight launcher; boots provider on interaction |
| `ahize/capabilities` | Programmatic feature matrix per provider            |
| `ahize/diagnostics`  | Dev-mode CDN probe with actionable hints            |

## Framework adapters

| Sub-path          | Framework                              |
| ----------------- | -------------------------------------- |
| `ahize/next`      | Next.js (App Router + Pages Router)    |
| `ahize/nuxt`      | Nuxt 3                                 |
| `ahize/vue`       | Vue 3                                  |
| `ahize/react`     | React 18+                              |
| `ahize/svelte`    | Svelte                                 |
| `ahize/sveltekit` | SvelteKit                              |
| `ahize/remix`     | Remix                                  |
| `ahize/astro`     | Astro                                  |
| `ahize/angular`   | Angular 16+                            |
| `ahize/partytown` | Builder.io Partytown forwarding helper |

## Why ahize

- **Unified API** — swap providers without rewriting app code
- **Zero runtime dependencies**
- **Tree-shakeable** — only the sub-path you import ships
- **Strict TypeScript** — no `any`, generic `track<T>`, discriminated unions
- **SSR-safe by construction** — no module-top-level `window` access
- **CSP-aware** — nonce support + per-provider directive catalog
- **GDPR-first** — `consent: false` short-circuits, defer strategies built in
- **Queue-before-load** — pre-boot calls survive and drain in order
- **Identity state machine** — typed verification (HMAC / JWT / callback)
- **Performance** — facade mode, idle/interaction defer, Partytown

## License

[MIT](./LICENSE) © [productdevbook](https://github.com/productdevbook)
