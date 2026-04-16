# ahize

> Zero-dependency TypeScript wrappers for live chat & customer support widgets — Intercom, Crisp, Tawk.to, Zendesk, HubSpot and more. Unified API, tree-shakeable, pure TypeScript.

[![npm version](https://img.shields.io/npm/v/ahize.svg)](https://www.npmjs.com/package/ahize)
[![npm downloads](https://img.shields.io/npm/dm/ahize.svg)](https://www.npmjs.com/package/ahize)
[![license](https://img.shields.io/npm/l/ahize.svg)](./LICENSE)

## Features

- 🔌 **Unified API** across every major live chat provider
- 📦 **Zero runtime dependencies**
- 🌲 **Tree-shakeable** — pay only for what you import
- 🧩 **Sub-path imports** — `ahize/intercom`, `ahize/crisp`, …
- 💪 **Pure TypeScript**, strict types
- 🌍 **Works everywhere** — browser, SSR-safe noop on the server

## Install

```bash
npm install ahize
# or
pnpm add ahize
# or
yarn add ahize
```

## Quick start

```ts
import { load } from "ahize/intercom";

await load({ appId: "abc123" });
```

Unified API across providers:

```ts
import { identify, track } from "ahize";

identify({ id: "user_1", email: "ada@example.com" });
track("plan_upgraded", { tier: "pro" });
```

## Providers

| Provider   | Import path        | Status      |
| ---------- | ------------------ | ----------- |
| Intercom   | `ahize/intercom`   | planned     |
| Crisp      | `ahize/crisp`      | planned     |
| Tawk.to    | `ahize/tawk`       | planned     |
| Zendesk    | `ahize/zendesk`    | planned     |
| HubSpot    | `ahize/hubspot`    | planned     |

## License

[MIT](./LICENSE) © [productdevbook](https://github.com/productdevbook)
