// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"

interface Recorded {
  setColorScheme: Array<"light" | "dark" | "auto">
  deleteCustomAttribute: string[]
  deleteConversationCustomAttribute: string[]
  popoutChatWindow: number
}

function fakeChatwoot(rec: Recorded): Record<string, unknown> {
  return {
    setUser: () => {},
    setCustomAttributes: () => {},
    setConversationCustomAttributes: () => {},
    deleteCustomAttribute: (key: string) => rec.deleteCustomAttribute.push(key),
    deleteConversationCustomAttribute: (key: string) =>
      rec.deleteConversationCustomAttribute.push(key),
    setLabel: () => {},
    setColorScheme: (mode: "light" | "dark" | "auto") => rec.setColorScheme.push(mode),
    popoutChatWindow: () => {
      rec.popoutChatWindow++
    },
    toggle: () => {},
    reset: () => {},
  }
}

async function bootChatwoot(rec: Recorded): Promise<typeof import("../src/providers/chatwoot.ts")> {
  const chatwoot = await import("../src/providers/chatwoot.ts")
  const loadPromise = chatwoot.load({ websiteToken: "tok_xyz" })
  await new Promise((r) => setTimeout(r, 0))

  // Simulate the SDK loader replacing the stub.
  const script = document.getElementById("ahize-chatwoot") as HTMLScriptElement
  expect(script).toBeTruthy()
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).chatwootSDK = { run: () => {} }
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).$chatwoot = fakeChatwoot(rec)
  script.dispatchEvent(new Event("load"))

  // Chatwoot signals readiness via a window CustomEvent, not script load.
  window.dispatchEvent(new CustomEvent("chatwoot:ready"))

  await loadPromise
  return chatwoot
}

describe("chatwoot (browser) — vendor-doc audit fixes (#79)", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).chatwootSDK
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).$chatwoot
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).chatwootSettings
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("setTheme delegates to setColorScheme when the SDK exposes it", async () => {
    const rec: Recorded = {
      setColorScheme: [],
      deleteCustomAttribute: [],
      deleteConversationCustomAttribute: [],
      popoutChatWindow: 0,
    }
    const chatwoot = await bootChatwoot(rec)
    await chatwoot.setTheme({ mode: "dark" })
    expect(rec.setColorScheme).toEqual(["dark"])
    await chatwoot.destroy()
  })

  it("setColorScheme calls the SDK directly", async () => {
    const rec: Recorded = {
      setColorScheme: [],
      deleteCustomAttribute: [],
      deleteConversationCustomAttribute: [],
      popoutChatWindow: 0,
    }
    const chatwoot = await bootChatwoot(rec)
    await chatwoot.setColorScheme("light")
    await chatwoot.setColorScheme("auto")
    expect(rec.setColorScheme).toEqual(["light", "auto"])
    await chatwoot.destroy()
  })

  it("deleteAttribute routes to contact vs conversation", async () => {
    const rec: Recorded = {
      setColorScheme: [],
      deleteCustomAttribute: [],
      deleteConversationCustomAttribute: [],
      popoutChatWindow: 0,
    }
    const chatwoot = await bootChatwoot(rec)
    await chatwoot.deleteAttribute({ scope: "contact", key: "plan" })
    await chatwoot.deleteAttribute({ scope: "conversation", key: "topic" })
    expect(rec.deleteCustomAttribute).toEqual(["plan"])
    expect(rec.deleteConversationCustomAttribute).toEqual(["topic"])
    await chatwoot.destroy()
  })

  it("popoutChatWindow forwards to the SDK", async () => {
    const rec: Recorded = {
      setColorScheme: [],
      deleteCustomAttribute: [],
      deleteConversationCustomAttribute: [],
      popoutChatWindow: 0,
    }
    const chatwoot = await bootChatwoot(rec)
    await chatwoot.popoutChatWindow()
    expect(rec.popoutChatWindow).toBe(1)
    await chatwoot.destroy()
  })

  it("bridges chatwoot:opened / closed / on-start-conversation / postback", async () => {
    const rec: Recorded = {
      setColorScheme: [],
      deleteCustomAttribute: [],
      deleteConversationCustomAttribute: [],
      popoutChatWindow: 0,
    }
    const chatwoot = await bootChatwoot(rec)

    const opened: unknown[] = []
    const closed: unknown[] = []
    const started: unknown[] = []
    const postbacks: unknown[] = []
    chatwoot.on("opened", (p) => opened.push(p))
    chatwoot.on("closed", (p) => closed.push(p))
    chatwoot.on("startConversation", (p) => started.push(p))
    chatwoot.on("postback", (p) => postbacks.push(p))

    window.dispatchEvent(new CustomEvent("chatwoot:opened"))
    window.dispatchEvent(new CustomEvent("chatwoot:closed"))
    window.dispatchEvent(
      new CustomEvent("chatwoot:on-start-conversation", { detail: { source: "bubble" } }),
    )
    window.dispatchEvent(new CustomEvent("chatwoot:postback", { detail: { value: "yes" } }))

    expect(opened).toHaveLength(1)
    expect(closed).toHaveLength(1)
    expect(started).toEqual([{ source: "bubble" }])
    expect(postbacks).toEqual([{ value: "yes" }])

    await chatwoot.destroy()
  })
})
