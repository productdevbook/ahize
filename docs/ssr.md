# SSR guide

`ahize` is SSR-safe by construction. Every public method is a no-op when
`window`/`document` are unavailable, so you can import anywhere.

## Tree-shaking server bundles

If you want to be belt-and-braces sure DOM code never enters your SSR
bundle, import from `ahize/server`:

```ts
import { load, identify, track, pageView } from "ahize/server";
// every method is a typed no-op; tree-shakers drop the rest
```

## Next.js (App Router)

```tsx
"use client";
import * as intercom from "ahize/intercom";
import { createAhizeComponent } from "ahize/next";
import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

const Ahize = createAhizeComponent(React, { usePathname, useSearchParams });

export default function ChatBoot() {
  return <Ahize provider={intercom} options={{ appId: "abc123" }} autoPageView />;
}
```

Mount once in `app/layout.tsx` (inside a Client Component child) — not per
route, otherwise targeting rules and unread counters reset on every
navigation.

## Next.js (Pages Router)

Same component, mount inside `_app.tsx`.

## Nuxt 3

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

The `.client.ts` suffix tells Nuxt to skip this plugin during SSR. ahize
itself would no-op anyway, but skipping the import keeps the SSR bundle
even smaller.

## Remix

```tsx
// app/root.tsx
import { useLocation } from "@remix-run/react";
import * as React from "react";
import * as intercom from "ahize/intercom";
import { createRemixAhize } from "ahize/remix";

const useAhize = createRemixAhize(React, { useLocation });

export default function App() {
  useAhize({ provider: intercom, options: { appId: "abc123" }, autoPageView: true });
  return <Outlet />;
}
```

## SvelteKit

```ts
// src/routes/+layout.svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import * as intercom from "ahize/intercom";
  import { setupAhize } from "ahize/sveltekit";

  onMount(() => {
    setupAhize({ provider: intercom, options: { appId: "abc123" }, autoPageView: true }, { afterNavigate });
  });
</script>
```

## Astro

```astro
---
// src/components/Chat.astro
---
<script>
  import * as intercom from "ahize/intercom";
  import { mountAhize } from "ahize/astro";

  mountAhize({ provider: intercom, options: { appId: "abc123" }, autoPageView: true });
</script>
```

Use `client:idle` so the boot waits for browser idle time:

```astro
<Chat client:idle />
```

## Cloudflare Workers / edge runtime

`ahize/server` is the safe entry. The other entries are tree-shaken to
almost nothing in worker bundles since every method short-circuits on the
`isBrowser()` guard before referencing any DOM.
