# Capability matrix

Programmatic version: `import { capabilities } from "ahize/capabilities"`.

| Provider        | HMAC | JWT | Callback | Track events | Unread count | Prefill | setLocale | setTheme | Self-hosted | Regions |
| --------------- | ---- | --- | -------- | ------------ | ------------ | ------- | --------- | -------- | ----------- | ------- |
| intercom        | ✅   | ✅  |          | ✅           | ✅           |         |           |          |             | ✅      |
| crisp           | ✅   |     |          | ✅           | ✅           |         | ✅        |          |             |         |
| tawk            | ✅   |     |          | ✅           | ✅           |         |           |          |             |         |
| zendesk         |      | ✅  | ✅       | ✅           | ✅           |         | ✅        |          |             |         |
| zendesk-classic |      |     |          |              |              | ✅      |           |          |             |         |
| hubspot         |      | ✅  |          | ✅           | ✅           |         |           |          |             | ✅      |
| chatwoot        | ✅   |     |          | ✅           | ✅           |         | ✅        | ✅       | ✅          |         |
| livechat        |      |     |          | ✅           |              |         |           |          |             |         |
| drift           |      | ✅  |          | ✅           |              |         |           |          |             |         |
| freshchat       |      | ✅  |          | ✅           |              |         |           |          |             | ✅      |
| olark           |      |     |          | ✅           |              |         |           |          |             |         |
| userlike        |      |     |          | ✅           |              |         | ✅        |          |             |         |
| helpscout       | ✅   |     |          | ✅           |              | ✅      |           |          |             |         |
| smartsupp       |      |     |          | ✅           |              |         |           |          |             |         |
| liveagent       |      |     |          |              |              |         |           |          | ✅          |         |
| gist            | ✅   |     |          | ✅           |              |         |           |          |             |         |
| jivochat        |      |     |          |              |              |         |           |          |             |         |
| tidio           |      |     |          | ✅           |              |         |           |          |             |         |
| sendbird        |      |     |          |              |              |         |           |          |             |         |

Legend:

- **HMAC**: server-issued hash gates `identify()` (e.g. Intercom user_hash, Chatwoot identifier_hash, HelpScout signature, Gist user_hash).
- **JWT**: signed token; preferred when supported.
- **Callback**: provider asks ahize for a fresh token via a `getToken()` function (Zendesk loginUser).
- **Track events**: native event sink. Track-less providers fall back to setting a custom attribute.
- **Unread count**: native callback for unread message counter.
- **Prefill**: programmatic compose API (HelpScout `Beacon('prefill', {...})`, Zendesk Classic `webWidget.prefill`).
- **setLocale**: change widget language without remount.
- **setTheme**: dark/light/auto + accent colour at runtime.
- **Self-hosted**: a `baseUrl` opt sends to your own deployment.
- **Regions**: pick EU vs US vs AU at boot time.

## Programmatic check

```ts
import { capabilities, supports } from "ahize/capabilities";

if (supports("zendesk", "callback")) {
  identify({ id: "u1", verification: { kind: "callback", getToken } });
} else if (supports("zendesk", "jwt")) {
  identify({ id: "u1", verification: { kind: "jwt", token } });
}

// or read the whole record
const caps = capabilities("intercom");
console.log(caps.regions); // true
```
