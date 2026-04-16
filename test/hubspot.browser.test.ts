// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"

interface FakeApi {
  on: Map<string, Array<(p: unknown) => void>>
  widget: {
    load: () => void
    open: () => void
    close: () => void
    remove: () => void
    refresh: () => void
    status: () => { loaded: boolean; pending: boolean }
  }
  clear: () => void
  fire: (event: string, payload?: unknown) => void
}

function fakeHubSpot(): FakeApi {
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  return {
    on: handlers,
    widget: {
      load: () => {},
      open: () => {},
      close: () => {},
      remove: () => {},
      refresh: () => {},
      status: () => ({ loaded: true, pending: false }),
    },
    clear: () => {},
    fire(event, payload) {
      for (const h of handlers.get(event) ?? []) h(payload)
    },
  }
}

async function bootHubSpot(
  options?: Partial<import("../src/providers/hubspot.ts").HubSpotLoadOptions>,
): Promise<{
  hubspot: typeof import("../src/providers/hubspot.ts")
  fake: FakeApi
}> {
  const hubspot = await import("../src/providers/hubspot.ts")
  const fake = fakeHubSpot()
  const apiShim = {
    widget: fake.widget,
    clear: fake.clear,
    on: (event: string, listener: (p: unknown) => void) => {
      const arr = fake.on.get(event) ?? []
      arr.push(listener)
      fake.on.set(event, arr)
    },
    off: () => {},
  }
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).HubSpotConversations = apiShim
  const loadPromise = hubspot.load({ portalId: "12345", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-hubspot") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  for (const cb of (globalThis as any).hsConversationsOnReady ?? []) cb()
  await loadPromise
  return { hubspot, fake }
}

describe("hubspot (browser) — vendor-doc audit fixes (#85)", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).HubSpotConversations
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hsConversationsSettings
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hsConversationsOnReady
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any)._hsq
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("ap1 region uses js-ap1.hs-scripts.com", async () => {
    const { hubspot } = await bootHubSpot({ region: "ap1" })
    const script = document.getElementById("ahize-hubspot") as HTMLScriptElement
    expect(script.src).toContain("js-ap1.hs-scripts.com")
    await hubspot.destroy()
  })

  it("typed settings populate hsConversationsSettings", async () => {
    const { hubspot } = await bootHubSpot({
      inlineEmbedSelector: "#chat-here",
      enableWidgetCookieBanner: "ON_EXIT_INTENT",
      disableAttachment: true,
      disableInitialInputFocus: true,
      avoidInlineStyles: true,
      hideNewThreadLink: true,
      loadImmediately: true,
    })
    // biome-ignore lint/suspicious/noExplicitAny: test shim
    const settings = (globalThis as any).hsConversationsSettings as Record<string, unknown>
    expect(settings).toMatchObject({
      inlineEmbedSelector: "#chat-here",
      enableWidgetCookieBanner: "ON_EXIT_INTENT",
      disableAttachment: true,
      disableInitialInputFocus: true,
      avoidInlineStyles: true,
      hideNewThreadLink: true,
      loadImmediately: true,
    })
    await hubspot.destroy()
  })

  it("on(event) bridges all 7 documented widget events", async () => {
    const { hubspot, fake } = await bootHubSpot()
    const seen: Record<string, unknown[]> = {}
    const events = [
      "conversationStarted",
      "conversationClosed",
      "userSelectedThread",
      "contactAssociated",
      "userInteractedWithWidget",
      "widgetLoaded",
      "widgetClosed",
      "quickReplyButtonClick",
    ] as const
    for (const e of events) {
      seen[e] = []
      hubspot.on(e, (p) => seen[e]?.push(p))
    }
    for (const e of events) fake.fire(e, { event: e })
    for (const e of events) expect(seen[e]).toEqual([{ event: e }])
    await hubspot.destroy()
  })

  it("status() returns the widget's loaded/pending state", async () => {
    const { hubspot } = await bootHubSpot()
    expect(hubspot.status()).toEqual({ loaded: true, pending: false })
    await hubspot.destroy()
  })

  it("identify() rejects non-jwt verification with token-not-jwt error message", async () => {
    const { hubspot } = await bootHubSpot()
    await expect(
      hubspot.identify({
        id: "u1",
        verification: { kind: "hmac", hash: "x" },
      }),
    ).rejects.toThrow(/identification token/)
    await hubspot.destroy()
  })
})
