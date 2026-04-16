# ahize

Zero-dependency TypeScript wrappers for live chat & customer support widgets — unified, type-safe API over 18 providers (Intercom, Crisp, Tawk.to, Zendesk, Zendesk Classic, HubSpot, Chatwoot, LiveChat, Drift, Freshchat, Olark, Userlike, HelpScout, Smartsupp, LiveAgent, Gist, JivoChat, Tidio, Sendbird). Pure TypeScript, tree-shakeable, SSR-safe, CSP-aware.

> [!IMPORTANT]
> Keep `AGENTS.md` updated with project status.

## Project Structure

```
src/
  index.ts                  # Main API — re-exports types & helpers
  errors.ts                 # AhizeError, ProviderNotLoadedError, ScriptLoadError
  env.d.ts                  # Runtime DOM type declarations
  _types.ts                 # Visitor/Identity/Verification/LoadOptions/EventMetadata
  _loader.ts                # injectScript + removeScript + readCspNonce + isBrowser
  _queue.ts                 # createQueue<T> — pre-boot call buffering
  _identity.ts              # createIdentityStore — anonymous → identified state machine
  _lifecycle.ts             # createLifecycle + hashConfig — idle → loading → ready → shutdown
  _defer.ts                 # waitForDefer — idle/interaction/manual/immediate
  _provider.ts              # ProviderContext factory shared by all adapters
  csp.ts                    # cspDirectives + mergeCsp + watchCspViolations
  facade.ts                 # mountFacade — <2KB launcher, boots on interaction
  capabilities.ts           # capabilities() + supports() per provider
  diagnostics.ts            # diagnose() — dev-mode CDN probe
  server.ts                 # Stub for SSR (every method is a typed no-op)
  providers/
    intercom.ts             # ahize/intercom (HMAC + JWT + regions + softReboot)
    crisp.ts                # ahize/crisp (HMAC + reconfigure + setData/setCompany)
    tawk.ts                 # ahize/tawk (full TS types + switchWidget + collision warning)
    zendesk.ts              # ahize/zendesk (Messenger; JWT + callback + onLoginError)
    zendesk-classic.ts      # ahize/zendesk-classic (Web Widget legacy)
    hubspot.ts              # ahize/hubspot (JWT + EU/US regions + lowercase validator)
    chatwoot.ts             # ahize/chatwoot (HMAC + self-hosted + event emitter + safeShutdown)
    livechat.ts             # ahize/livechat (LiveChatWidget.call + .on)
    drift.ts                # ahize/drift (JWT + drift.api.openChat)
    freshchat.ts            # ahize/freshchat (JWT-first, restoreId fallback)
    olark.ts                # ahize/olark (api.box.show/expand/shrink)
    userlike.ts             # ahize/userlike (Result<ok,err> unwrap)
    helpscout.ts            # ahize/helpscout (HMAC signature + suggest/prefill/navigate)
    smartsupp.ts            # ahize/smartsupp (resolves config-vs-runtime visibility)
    liveagent.ts            # ahize/liveagent (per-account subdomain or selfHosted)
    gist.ts                 # ahize/gist (Intercom-clone shape)
    jivochat.ts             # ahize/jivochat (rate-limited setContactInfo + multi-listener)
    tidio.ts                # ahize/tidio (typed wrapper for tidioChat-* events)
    sendbird.ts             # ahize/sendbird (track throws unless onTrack)
  adapters/
    next.ts                 # ahize/next (App Router + Pages Router)
    nuxt.ts                 # ahize/nuxt (Nuxt 3 + 4 plugin factory)
    vue.ts                  # ahize/vue (Vue 3 composable)
    react.ts                # ahize/react (framework-agnostic React hook)
    svelte.ts               # ahize/svelte (store)
    sveltekit.ts            # ahize/sveltekit (afterNavigate)
    remix.ts                # ahize/remix (useLocation hook)
    astro.ts                # ahize/astro (island + view-transitions)
    angular.ts              # ahize/angular (standalone service)
    partytown.ts            # ahize/partytown (forwardSettings helper)
test/
  *.test.ts                 # vitest suites (158 tests, 12 files)
e2e/
  *.spec.ts                 # Playwright skeletons (run on demand)
scripts/
  bundle-budget.mjs         # Per-file size budget enforcer
```

## Public API

Single entry: `ahize` (types & helpers). 19 provider sub-paths. 6 utility sub-paths (`server`, `csp`, `facade`, `capabilities`, `diagnostics`, plus the 10 framework adapters).

Key functions per provider: `load()`, `identify()`, `track()`, `pageView()`, `show()`, `hide()`, `shutdown()`, `destroy()`, `ready()`, `isReady()`, `state()`, `getIdentity()`, `onIdentityChange()`. Most providers also expose `onUnreadCountChange()`.

## Build & Scripts

```bash
pnpm build          # obuild (rolldown) → dist/
pnpm dev            # vitest watch
pnpm lint           # oxlint + oxfmt --check
pnpm lint:fix       # oxlint --fix + oxfmt
pnpm fmt            # oxfmt
pnpm test           # pnpm lint && pnpm typecheck && vitest run
pnpm typecheck      # tsgo --noEmit
pnpm bundle-budget  # check raw byte size budgets
pnpm attw           # Are-The-Types-Wrong CLI
pnpm release        # pnpm test && build && bundle-budget && bumpp --commit --tag --push --all
```

## Code Conventions

- **Pure ESM** — no CJS
- **Zero runtime dependencies**
- **TypeScript strict** — tsgo for typecheck, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`-friendly
- **Formatter:** oxfmt (double quotes, semicolons)
- **Linter:** oxlint (unicorn, typescript, oxc plugins)
- **Tests:** vitest in `test/` directory, flat naming
- **Internal files:** prefix with `_` (`_types.ts`, `_queue.ts`, `_lifecycle.ts`, …)
- **Exports:** explicit in `src/index.ts`, no barrel re-exports
- **Commits:** semantic lowercase (`feat:`, `fix:`, `chore:`, `docs:`)
- **Issues:** reference in commits (`feat(#N):`)

## Testing

- **Framework:** vitest (jsdom for browser tests via `// @vitest-environment jsdom`)
- **Location:** `test/` (flat structure)
- **Coverage:** `@vitest/coverage-v8`
- **e2e:** Playwright in `e2e/` (run on demand, requires real credentials)
- Run all: `pnpm test`
- Run single: `pnpm vitest run test/<file>.test.ts`

## Status

- ✅ All 78 tracked GitHub issues closed (see roadmap #78).
- ✅ 158 unit tests green across 12 files.
- ✅ Bundle budget enforced (chatwoot ≤9KB raw, other providers ≤6KB raw, adapters ≤2KB raw — gzip ≈ 1/3 of raw).
- ✅ Published to npm (provenance) and JSR.
