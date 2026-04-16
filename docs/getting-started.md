# Getting started

`ahize` is a zero-dependency TypeScript wrapper over the major live chat and
customer support widgets. It injects the provider's CDN script on demand and
gives you a unified surface for identifying users, tracking events and toggling
the widget.

## Install

```bash
npm install ahize
```

## Usage

Import only the provider you need:

```ts
import { load, identify, track, show } from "ahize/intercom";

await load({ appId: "abc123" });
identify({ id: "user_1", email: "ada@example.com" });
track("plan_upgraded", { tier: "pro" });
show();
```

Every provider exports the same surface:

- `load(options)`
- `identify(visitor)`
- `track(event, metadata?)`
- `show()` / `hide()`
- `shutdown()`

## SSR

Every function is a no-op when `window`/`document` is unavailable, so it is safe
to call from universal code.
