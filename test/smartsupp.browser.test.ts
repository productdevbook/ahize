// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface SCall {
  cmd: string
  args: unknown[]
}

async function bootSmartsupp(
  options?: Partial<import("../src/providers/smartsupp.ts").SmartsuppLoadOptions>,
): Promise<{
  smartsupp: typeof import("../src/providers/smartsupp.ts")
  calls: SCall[]
  fire: (event: string, payload?: unknown) => void
}> {
  const smartsupp = await import("../src/providers/smartsupp.ts")
  const calls: SCall[] = []
  const handlers = new Map<string, Array<(p?: unknown) => void>>()
  const fn = (cmd: string, ...args: unknown[]) => {
    calls.push({ cmd, args })
    if (cmd === "on" && typeof args[0] === "string" && typeof args[1] === "function") {
      const arr = handlers.get(args[0]) ?? []
      arr.push(args[1] as (p?: unknown) => void)
      handlers.set(args[0], arr)
    }
    return undefined
  }
  ;(fn as unknown as { vid?: string }).vid = "vid_123"
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).smartsupp = fn
  const loadPromise = smartsupp.load({ key: "key_xyz", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-smartsupp") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await new Promise((r) => setTimeout(r, 60))
  await loadPromise
  const fire = (event: string, payload?: unknown) => {
    for (const cb of handlers.get(event) ?? []) cb(payload)
  }
  return { smartsupp, calls, fire }
}

describe("smartsupp (browser) — vendor-doc audit fixes (#92)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).smartsupp
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any)._smartsupp
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("typed config keys populate _smartsupp", async () => {
    const { smartsupp } = await bootSmartsupp({
      cookieDomain: ".example.com",
      orientation: "left",
      color: "#abc",
      offsetX: 20,
      privacyNoticeEnabled: true,
      privacyNoticeUrl: "https://x/privacy",
      ratingEnabled: true,
      gaKey: "G-XXX",
      hideMobileWidget: true,
    })
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const cfg = (globalThis as any)._smartsupp as Record<string, unknown>
    expect(cfg).toMatchObject({
      cookieDomain: ".example.com",
      orientation: "left",
      color: "#abc",
      offsetX: 20,
      privacyNoticeEnabled: true,
      privacyNoticeUrl: "https://x/privacy",
      ratingEnabled: true,
      gaKey: "G-XXX",
      hideMobileWidget: true,
    })
    await smartsupp.destroy()
  })

  it("language/group at load-time fire commands on boot", async () => {
    const { smartsupp, calls } = await bootSmartsupp({ language: "tr", group: "sales" })
    const cmds = calls.map((c) => ({ cmd: c.cmd, args: c.args }))
    expect(cmds).toContainEqual({ cmd: "language", args: ["tr"] })
    expect(cmds).toContainEqual({ cmd: "group", args: ["sales"] })
    await smartsupp.destroy()
  })

  it("open/close/prefillMessage/sendMessage/setGroup/setLanguage forward", async () => {
    const { smartsupp, calls } = await bootSmartsupp()
    calls.length = 0
    await smartsupp.open()
    await smartsupp.close()
    await smartsupp.prefillMessage("draft text")
    await smartsupp.sendMessage("merhaba")
    await smartsupp.setGroup("support")
    await smartsupp.setLanguage("en")
    const cmds = calls.map((c) => c.cmd)
    expect(cmds).toEqual([
      "chat:open",
      "chat:close",
      "chat:message",
      "chat:send",
      "group",
      "language",
    ])
    await smartsupp.destroy()
  })

  it("getVisitorId returns smartsupp.vid", async () => {
    const { smartsupp } = await bootSmartsupp()
    expect(smartsupp.getVisitorId()).toBe("vid_123")
    await smartsupp.destroy()
  })

  it("on(event) bridges messageSent/messageReceived/messengerClose", async () => {
    const { smartsupp, fire } = await bootSmartsupp()
    let sent: unknown
    let received: unknown
    let closed = 0
    smartsupp.on("messageSent", (p) => {
      sent = p
    })
    smartsupp.on("messageReceived", (p) => {
      received = p
    })
    smartsupp.on("messengerClose", () => {
      closed++
    })

    fire("message_sent", { id: 1 })
    fire("message_received", { id: 2 })
    fire("messenger_close")

    expect(sent).toEqual({ id: 1 })
    expect(received).toEqual({ id: 2 })
    expect(closed).toBe(1)
    await smartsupp.destroy()
  })
})
