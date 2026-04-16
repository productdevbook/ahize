# GDPR / consent guide

`ahize` never injects a script on import. You must call `load()` to start.
Pair this with your Consent Management Platform (CMP) of choice.

## consent: false short-circuits load()

```ts
import * as intercom from "ahize/intercom";

await intercom.load({ appId: "...", consent: hasMarketingConsent() });
// when consent is false, load() resolves without injecting anything
```

## Defer strategies (#7)

```ts
load({ appId: "...", defer: "idle" }); // requestIdleCallback (default)
load({ appId: "...", defer: "interaction" }); // first pointerdown/scroll/keydown
load({ appId: "...", defer: "manual" }); // never injects on its own
load({ appId: "...", defer: "immediate" }); // pre-consent banner pages
```

## OneTrust

```js
OneTrust.OnConsentChanged(() => {
  if (OnetrustActiveGroups.includes("C0004")) {
    // "C0004" = targeting cookies
    intercom.load({ appId: "..." });
  } else {
    intercom.destroy();
  }
});
```

## Cookiebot

```js
window.addEventListener("CookiebotOnAccept", () => {
  if (Cookiebot.consent.marketing) intercom.load({ appId: "..." });
});
window.addEventListener("CookiebotOnDecline", () => intercom.destroy());
```

## Iubenda

```js
_iub.csConfiguration.callback = {
  onConsentGiven: () => intercom.load({ appId: "..." }),
  onConsentRejected: () => intercom.destroy(),
};
```

## Tarteaucitron

```js
tarteaucitron.user.intercomLoader = () => intercom.load({ appId: "..." });
tarteaucitron.services.intercom = {
  key: "intercom",
  type: "support",
  name: "Intercom",
  uri: "https://www.intercom.com/legal/privacy",
  needConsent: true,
  cookies: ["intercom-id-*", "intercom-session-*"],
  js: () => tarteaucitron.user.intercomLoader(),
  fallback: () => {},
};
```

## After-the-fact revocation

`destroy()` removes the script tag, deletes the global, clears listeners,
and resets the queue. Calling `load()` afterward starts fresh.

## Region selection (EU portals)

Some providers route traffic through region-specific endpoints. Always pick
the EU one for EEA visitors:

```ts
import * as hubspot from "ahize/hubspot";
hubspot.load({ portalId: "...", region: "eu1" }); // → js-eu1.hs-scripts.com

import * as intercom from "ahize/intercom";
intercom.load({ appId: "...", region: "eu" }); // → api-iam.eu.intercom.io
```
