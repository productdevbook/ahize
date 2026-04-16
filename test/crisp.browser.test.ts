// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface CrispBus extends Array<unknown[]> {
  push(cmd: unknown[]): number
}

async function bootCrisp(
  options?: Partial<import("../src/providers/crisp.ts").CrispLoadOptions>,
): Promise<{
  crisp: typeof import("../src/providers/crisp.ts")
  bus: CrispBus
  fire: (event: string, payload?: unknown) => void
}> {
  const crisp = await import("../src/providers/crisp.ts")
  const loadPromise = crisp.load({ websiteId: "wid_xyz", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-crisp") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await loadPromise

  // biome-ignore lint/suspicious/noExplicitAny: test shim
  const bus = (globalThis as any).$crisp as CrispBus

  // Fire helper: call the registered handler for a given event name.
  const fire = (event: string, payload?: unknown) => {
    for (const cmd of bus) {
      if (cmd[0] === "on" && cmd[1] === event && typeof cmd[2] === "function") {
        ;(cmd[2] as (p?: unknown) => void)(payload)
      }
    }
  }

  return { crisp, bus, fire }
}

describe("crisp (browser) — vendor-doc audit fixes (#80)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).$crisp
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).CRISP_WEBSITE_ID
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).CRISP_TOKEN_ID
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).CRISP_RUNTIME_CONFIG
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("runtime config keys (safeMode/cookieDomain/etc) populate CRISP_RUNTIME_CONFIG", async () => {
    const { crisp } = await bootCrisp({
      locale: "tr",
      safeMode: true,
      cookieDomain: ".example.com",
      cookieExpire: 3600,
      sessionMerge: true,
      lockMaximized: true,
      lockFullview: false,
    })
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const cfg = (globalThis as any).CRISP_RUNTIME_CONFIG as Record<string, unknown>
    expect(cfg).toMatchObject({
      locale: "tr",
      safeMode: true,
      cookieDomain: ".example.com",
      cookieExpire: 3600,
      sessionMerge: true,
      lockMaximized: true,
      lockFullview: false,
    })
    await crisp.destroy()
  })

  it("show() no longer force-opens; open()/close()/toggle() are distinct", async () => {
    const { crisp, bus } = await bootCrisp()
    const before = bus.length
    await crisp.show()
    await crisp.open()
    await crisp.close()
    await crisp.toggle()
    const cmds = bus
      .slice(before)
      .filter((c) => c[0] === "do")
      .map((c) => c[1])
    expect(cmds).toEqual(["chat:show", "chat:open", "chat:close", "chat:toggle"])
    await crisp.destroy()
  })

  it("sendMessage / showLocalMessage / markRead / setMessageText push the right commands", async () => {
    const { crisp, bus } = await bootCrisp()
    const before = bus.length
    await crisp.sendMessage("merhaba")
    await crisp.showLocalMessage("agent here")
    await crisp.markRead()
    await crisp.setMessageText("draft text")
    const after = bus.slice(before)
    expect(after).toContainEqual(["do", "message:send", ["text", "merhaba"]])
    expect(after).toContainEqual(["do", "message:show", ["text", "agent here"]])
    expect(after).toContainEqual(["do", "message:read"])
    expect(after).toContainEqual(["set", "message:text", ["draft text"]])
    await crisp.destroy()
  })

  it("setUserAvatar / setSessionSegments / helpdesk* / runTrigger forward correctly", async () => {
    const { crisp, bus } = await bootCrisp()
    const before = bus.length
    await crisp.setUserAvatar("https://x/a.png")
    await crisp.setSessionSegments(["beta", "vip"], true)
    await crisp.helpdeskSearch("refund")
    await crisp.helpdeskArticleOpen("en", "billing")
    await crisp.runTrigger("trigger_1")
    const after = bus.slice(before)
    expect(after).toContainEqual(["set", "user:avatar", ["https://x/a.png"]])
    expect(after).toContainEqual(["set", "session:segments", [["beta", "vip"], true]])
    expect(after).toContainEqual(["do", "helpdesk:search", ["refund"]])
    expect(after).toContainEqual(["do", "helpdesk:article:open", ["en", "billing"]])
    expect(after).toContainEqual(["do", "trigger:run", ["trigger_1"]])
    await crisp.destroy()
  })

  it("on(event) bridges chatOpened/chatInitiated/messageSent/etc", async () => {
    const { crisp, fire } = await bootCrisp()
    let openedHits = 0
    let lastSent: unknown
    let availability: unknown
    crisp.on("chatOpened", () => {
      openedHits++
    })
    crisp.on("messageSent", (p) => {
      lastSent = p
    })
    crisp.on("websiteAvailabilityChanged", (p) => {
      availability = p
    })

    fire("chat:opened")
    fire("message:sent", { content: "hi" })
    fire("website:availability:changed", { status: "online" })

    expect(openedHits).toBe(1)
    expect(lastSent).toEqual({ content: "hi" })
    expect(availability).toEqual({ status: "online" })
    await crisp.destroy()
  })
})
