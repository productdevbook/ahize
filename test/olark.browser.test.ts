// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface OCall {
  method: string
  args: unknown[]
}

async function bootOlark(
  options?: Partial<import("../src/providers/olark.ts").OlarkLoadOptions>,
): Promise<{
  olark: typeof import("../src/providers/olark.ts")
  calls: OCall[]
  fire: (event: string, payload?: unknown) => void
  visitorDetailsResponse: { current: unknown }
}> {
  const olark = await import("../src/providers/olark.ts")
  const calls: OCall[] = []
  const handlers = new Map<string, Array<(p?: unknown) => void>>()
  const visitorDetailsResponse = { current: { emailAddress: "x@y", fullName: "Test User" } }
  const fn = (method: string, ...args: unknown[]) => {
    calls.push({ method, args })
    if (typeof args[0] === "function" && method.startsWith("api.") && method.includes(".on")) {
      const arr = handlers.get(method) ?? []
      arr.push(args[0] as (p?: unknown) => void)
      handlers.set(method, arr)
    }
    if (method === "api.visitor.getDetails" && typeof args[0] === "function") {
      ;(args[0] as (d: unknown) => void)(visitorDetailsResponse.current)
    }
    return undefined
  }
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).olark = fn
  const loadPromise = olark.load({ siteId: "site_xyz", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-olark") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await new Promise((r) => setTimeout(r, 60))
  await loadPromise
  const fire = (vendor: string, payload?: unknown) => {
    for (const cb of handlers.get(vendor) ?? []) cb(payload)
  }
  return { olark, calls, fire, visitorDetailsResponse }
}

describe("olark (browser) — vendor-doc audit fixes (#90)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).olark
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("group + locale at load time fire setOperatorGroup + setLocale", async () => {
    const { olark, calls } = await bootOlark({ group: "support", locale: "tr" })
    expect(calls.find((c) => c.method === "api.chat.setOperatorGroup")?.args).toEqual([
      { group: "support" },
    ])
    expect(calls.find((c) => c.method === "api.box.setLocale")?.args).toEqual(["tr"])
    await olark.destroy()
  })

  it("getVisitorDetails resolves with the callback payload", async () => {
    const { olark } = await bootOlark()
    const details = await olark.getVisitorDetails()
    expect(details).toMatchObject({ emailAddress: "x@y", fullName: "Test User" })
    await olark.destroy()
  })

  it("chat.* methods (sendMessageToVisitor/etc) forward correctly", async () => {
    const { olark, calls } = await bootOlark()
    calls.length = 0
    await olark.sendMessageToVisitor("hi")
    await olark.sendNotificationToVisitor("note v")
    await olark.sendNotificationToOperator("note o")
    await olark.updateVisitorNickname({ snippet: "VIP", hideDefault: true })
    await olark.updateVisitorStatus({ snippet: "browsing" })
    await olark.setOperatorGroup("sales")

    const methods = calls.map((c) => c.method)
    for (const m of [
      "api.chat.sendMessageToVisitor",
      "api.chat.sendNotificationToVisitor",
      "api.chat.sendNotificationToOperator",
      "api.chat.updateVisitorNickname",
      "api.chat.updateVisitorStatus",
      "api.chat.setOperatorGroup",
    ]) {
      expect(methods).toContain(m)
    }
    await olark.destroy()
  })

  it("on() bridges box + chat events", async () => {
    const { olark, fire } = await bootOlark()
    let shown = 0
    let beginCount = 0
    let lastMsg: unknown
    olark.on("boxShow", () => {
      shown++
    })
    olark.on("beginConversation", () => {
      beginCount++
    })
    olark.on("messageToOperator", (p) => {
      lastMsg = p
    })

    fire("api.box.onShow")
    fire("api.chat.onBeginConversation")
    fire("api.chat.onMessageToOperator", { body: "test" })

    expect(shown).toBe(1)
    expect(beginCount).toBe(1)
    expect(lastMsg).toEqual({ body: "test" })
    await olark.destroy()
  })
})
