# CSP directive catalog

`ahize` ships a per-provider CSP directive catalog. Use it to build your
`Content-Security-Policy` header without trial-and-error.

```ts
import { cspDirectives, mergeCsp, toHeaderString } from "ahize/csp";

const policy = mergeCsp(
  cspDirectives("intercom"),
  cspDirectives("crisp"),
  cspDirectives("chatwoot", { chatwootBaseUrl: "https://chat.example.com" }),
);

response.setHeader("Content-Security-Policy", toHeaderString(policy));
```

## Per-provider WSS endpoints

Most providers open a websocket. If your CSP uses strict `connect-src`,
the `wss://` entries below are non-negotiable.

| Provider | WSS endpoints |
| -------- | ------------- |
| Intercom | `wss://nexus-websocket-a.intercom.io`, `wss://nexus-websocket-b.intercom.io` |
| Crisp | `wss://client.relay.crisp.chat` |
| Tawk.to | `wss://*.tawk.to` |
| Zendesk | `wss://widget-mediator.zopim.com`, `wss://*.zopim.com` |
| HubSpot | `wss://*.hubspot.com` |
| Chatwoot | `wss://<your-host>/cable` |

## Nonce

Pass the same nonce to your provider's `load()` and your CSP's
`script-src 'nonce-XXX'`:

```html
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'nonce-abc123' https://widget.intercom.io">
```

```ts
load({ appId: "...", nonce: "abc123" });
```

## Watch for violations in dev

```ts
import { watchCspViolations } from "ahize/csp";

watchCspViolations((event) => {
  console.warn("CSP blocked", event.blockedURI, "for", event.violatedDirective);
});
```

## Disable `'self'` injection

`cspDirectives()` includes `'self'` by default in every directive. Pass
`includeSelf: false` if you compose your own base policy.
