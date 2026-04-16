// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface ZECall {
  api: string
  command: string
  args: unknown[]
}

async function bootZendesk(
  calls: ZECall[],
  options?: Partial<import("../src/providers/zendesk.ts").ZendeskLoadOptions>,
): Promise<typeof import("../src/providers/zendesk.ts")> {
  const zendesk = await import("../src/providers/zendesk.ts")
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).zE = (api: string, command: string, ...args: unknown[]) => {
    calls.push({ api, command, args })
    return undefined
  }
  const loadPromise = zendesk.load({ key: "12345678-1234-1234-1234-123456789abc", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ze-snippet") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await loadPromise
  return zendesk
}

describe("zendesk (browser) — vendor-doc audit fixes (#96)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).zE
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).zESettings
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("track() uses messenger:set / conversationFields (not messenger)", async () => {
    const calls: ZECall[] = []
    const zendesk = await bootZendesk(calls)
    await zendesk.track("plan_upgraded", { tier: "pro" })
    const trackCall = calls.find((c) => c.command === "conversationFields")
    expect(trackCall?.api).toBe("messenger:set")
    await zendesk.destroy()
  })

  it("pageView({locale}) uses messenger:set / locale", async () => {
    const calls: ZECall[] = []
    const zendesk = await bootZendesk(calls)
    await zendesk.pageView({ locale: "tr" })
    const localeCall = calls.find((c) => c.command === "locale")
    expect(localeCall?.api).toBe("messenger:set")
    expect(localeCall?.args).toEqual(["tr"])
    await zendesk.destroy()
  })

  it("pageView({path}) does NOT auto-attach a non-numeric conversationFields entry", async () => {
    const calls: ZECall[] = []
    const zendesk = await bootZendesk(calls)
    await zendesk.pageView({ path: "/checkout" })
    const offending = calls.find(
      (c) => c.command === "conversationFields" && JSON.stringify(c.args).includes('"path"'),
    )
    expect(offending).toBeUndefined()
    await zendesk.destroy()
  })

  it("show() and open() are now distinct", async () => {
    const calls: ZECall[] = []
    const zendesk = await bootZendesk(calls)
    calls.length = 0
    await zendesk.show()
    await zendesk.open()
    const cmds = calls.filter((c) => c.api === "messenger").map((c) => c.command)
    expect(cmds).toEqual(["show", "open"])
    await zendesk.destroy()
  })

  it("setConversationTags / setCookies / setZIndex / setCustomization route through messenger:set", async () => {
    const calls: ZECall[] = []
    const zendesk = await bootZendesk(calls)
    calls.length = 0
    await zendesk.setConversationTags(["beta", "vip"])
    await zendesk.setCookies("functional")
    await zendesk.setZIndex(9999)
    await zendesk.setCustomization({ color: { primary: "#abc" } })
    const setters = calls.filter((c) => c.api === "messenger:set").map((c) => c.command)
    expect(setters).toContain("conversationTags")
    expect(setters).toContain("cookies")
    expect(setters).toContain("zIndex")
    expect(setters).toContain("customization")
    await zendesk.destroy()
  })

  it("newConversation uses messenger:ui", async () => {
    const calls: ZECall[] = []
    const zendesk = await bootZendesk(calls)
    await zendesk.newConversation({ from: "test" })
    const nc = calls.find((c) => c.command === "newConversation")
    expect(nc?.api).toBe("messenger:ui")
    expect(nc?.args).toEqual([{ from: "test" }])
    await zendesk.destroy()
  })

  it("on(event) bridges all 13 documented messenger events", async () => {
    const calls: ZECall[] = []
    const zendesk = await bootZendesk(calls)
    const subscribed = calls.filter((c) => c.api === "messenger:on").map((c) => c.command)
    for (const e of [
      "open",
      "close",
      "conversationStarted",
      "conversationOpened",
      "proactiveMessageDisplayed",
      "proactiveMessageClicked",
      "newConversationButtonClicked",
      "conversationWithAgentRequested",
      "conversationAgentAssigned",
      "messagesShown",
      "postbackButtonClicked",
      "conversationExtensionOpened",
      "conversationExtensionDisplayed",
    ]) {
      expect(subscribed).toContain(e)
    }
    await zendesk.destroy()
  })

  it("load-time cookies/zIndex/customization apply via messenger:set on boot", async () => {
    const calls: ZECall[] = []
    const zendesk = await bootZendesk(calls, {
      cookies: "none",
      zIndex: 5000,
      customization: { hideAvatars: true },
    })
    const setters = calls.filter((c) => c.api === "messenger:set")
    const cookies = setters.find((c) => c.command === "cookies")
    const z = setters.find((c) => c.command === "zIndex")
    const cust = setters.find((c) => c.command === "customization")
    expect(cookies?.args).toEqual(["none"])
    expect(z?.args).toEqual([5000])
    expect(cust?.args).toEqual([{ hideAvatars: true }])
    await zendesk.destroy()
  })

  it("load() no longer warns on non-UUID keys", async () => {
    const warnings: string[] = []
    const orig = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]))
    }
    try {
      const calls: ZECall[] = []
      const zendesk = await bootZendesk(calls, { key: "not-a-uuid" })
      const uuidWarnings = warnings.filter((w) => w.includes("UUID"))
      expect(uuidWarnings).toEqual([])
      await zendesk.destroy()
    } finally {
      console.warn = orig
    }
  })
})
