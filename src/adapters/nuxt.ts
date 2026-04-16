/**
 * Nuxt 3 / Nuxt 4 plugin factory.
 *
 * @module
 */
// Nuxt 3 + 4 plugin factory. Use inside `~/plugins/ahize.client.ts`:
//
//   import { defineNuxtPlugin } from "#app";
//   import { useNuxtApp } from "#imports";
//   import * as intercom from "ahize/intercom";
//   import { createNuxtAhizePlugin } from "ahize/nuxt";
//
//   export default defineNuxtPlugin(createNuxtAhizePlugin({
//     provider: intercom,
//     options: { appId: "abc" },
//   }));

import type { Identity, IdentityState, LoadOptions } from "../_types.ts"

interface AhizeProvider {
  load(options: LoadOptions): Promise<void>
  identify(identity: Identity): Promise<void>
  shutdown(): Promise<void>
  pageView(info?: { path?: string; locale?: string }): Promise<void>
  isReady(): boolean
  getIdentity(): IdentityState
}

interface NuxtPluginContext {
  provide?: (name: string, value: unknown) => void
  $router?: { afterEach?: (cb: (to: { fullPath: string }) => void) => void }
  hook?: (name: string, cb: (...args: unknown[]) => void) => void
}

export interface NuxtAhizeOptions<T extends LoadOptions> {
  provider: AhizeProvider
  options: T
  identity?: Identity
  autoPageView?: boolean
  /** Inject under $ahize, default true. */
  provide?: boolean
}

export type NuxtAhizePlugin = (nuxtApp: NuxtPluginContext) => Promise<void>

export function createNuxtAhizePlugin<T extends LoadOptions>(
  opts: NuxtAhizeOptions<T>,
): NuxtAhizePlugin {
  return async (nuxtApp: NuxtPluginContext): Promise<void> => {
    if (typeof window === "undefined") return
    await opts.provider.load(opts.options)
    if (opts.identity) void opts.provider.identify(opts.identity)

    if (opts.autoPageView !== false && nuxtApp.$router?.afterEach) {
      nuxtApp.$router.afterEach((to) => {
        void opts.provider.pageView({ path: to.fullPath })
      })
    }

    if (opts.provide !== false) {
      nuxtApp.provide?.("ahize", opts.provider)
    }
  }
}
