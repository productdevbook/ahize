# Playwright e2e

Real-browser smoke tests for each provider. Booted from a static fixture
page that imports `ahize/<provider>` from the local build.

## Setup

```sh
pnpm dlx playwright install --with-deps chromium
pnpm e2e
```

## Adding a provider test

1. Add a fixture entry to `e2e/fixtures/providers.json` with the test
   credentials (use a sandbox/dev workspace).
2. Drop a `e2e/<provider>.spec.ts` that asserts the script tag is injected,
   `isReady()` flips to true, and `identify()` mutates the visible header.
3. Most providers expose `data-*` attributes on their iframe — assert
   visibility on those rather than provider-private DOM.

## CI

Disabled by default (requires real credentials). Wire `secrets.E2E_*`
on the repo and uncomment the `playwright` job in `.github/workflows/ci.yml`
to enable.
