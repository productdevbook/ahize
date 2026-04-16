# Migration guides

## From `react-use-intercom`

```diff
-import { IntercomProvider, useIntercom } from "react-use-intercom";
+import * as intercom from "ahize/intercom";
+import { createUseAhize } from "ahize/react";
+import * as React from "react";
+const useAhize = createUseAhize(React);

-<IntercomProvider appId="abc">{children}</IntercomProvider>
+const { isReady, identify, show, hide, shutdown, pageView } = useAhize({
+  provider: intercom,
+  options: { appId: "abc" },
+});
```

Equivalents:

| react-use-intercom | ahize |
| ------------------ | ----- |
| `boot(props)` | `load({ appId, ...props })` |
| `update(props)` | `identify(props)` |
| `trackEvent(name, meta)` | `track(name, meta)` |
| `show()` | `show()` |
| `hide()` | `hide()` |
| `shutdown()` | `shutdown()` |
| `hardShutdown()` | `destroy()` |
| `boot({ user_hash })` | `identify({ verification: { kind: "hmac", hash } })` |
| `boot({ intercom_user_jwt })` | `identify({ verification: { kind: "jwt", token } })` |

The notable difference: `ahize` separates *boot* (`load()`) from *user
identity* (`identify()`). `react-use-intercom` collapsed both into
`boot(props)`.

## From `react-zendesk`

```diff
-import Zendesk from "react-zendesk";
+import * as zendesk from "ahize/zendesk";
+import { createUseAhize } from "ahize/react";
+const useAhize = createUseAhize(React);

-<Zendesk defer zendeskKey="..." />
+useAhize({ provider: zendesk, options: { key: "...", defer: "idle" } });
```

`ahize/zendesk` targets the **Messenger** product (the post-2021 one). For
the legacy Web Widget (Classic), use `ahize/zendesk-classic`.

## From `tawk-messenger-react`

```diff
-import TawkMessengerReact from "@tawk.to/tawk-messenger-react";
+import * as tawk from "ahize/tawk";
+import { createUseAhize } from "ahize/react";

-<TawkMessengerReact propertyId="..." widgetId="default" />
+useAhize({ provider: tawk, options: { propertyId: "...", widgetId: "default" } });
```

`ahize/tawk` ships full TypeScript types — `tawk-messenger-react` has
been missing them since 2022 (issue #13).

## From `@productdevbook/chatwoot`, `vue-chatwoot`, `chatwoot-react`

```diff
-import Chatwoot from "@productdevbook/chatwoot";
+import * as chatwoot from "ahize/chatwoot";

-Chatwoot({ websiteToken: "...", baseUrl: "https://chat.example.com" })
+chatwoot.load({ websiteToken: "...", baseUrl: "https://chat.example.com" });
```

For self-hosted instances, `baseUrl` is normalized (trailing slash
stripped, http→https in prod). The `ahize/csp` helper auto-derives the
WSS endpoint:

```ts
import { cspDirectives } from "ahize/csp";
const csp = cspDirectives("chatwoot", { chatwootBaseUrl: "https://chat.example.com" });
// → connect-src includes wss://chat.example.com/cable
```

## From `@livechat/widget-react`

```diff
-import LiveChatWidget from "@livechat/widget-react";
+import * as livechat from "ahize/livechat";

-<LiveChatWidget license={123456} />
+livechat.load({ license: 123456 });
```

## Generic switch — same surface, different provider

The killer feature: if you switch from Intercom to Crisp, only your import
path changes:

```diff
-import * as chat from "ahize/intercom";
-await chat.load({ appId: "abc" });
+import * as chat from "ahize/crisp";
+await chat.load({ websiteId: "uuid" });

// these stay the same
chat.identify({ id: "u1", email: "a@b" });
chat.track("plan_upgraded");
chat.show();
```
