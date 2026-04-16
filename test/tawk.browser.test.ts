// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface CallLog {
  name: string
  args: unknown[]
}

function setupFakeApi(log: CallLog[]): Record<string, unknown> {
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  const tawk = (globalThis as any).Tawk_API as Record<string, unknown>
  // Replace stub methods with recorders.
  for (const m of [
    "setAttributes",
    "addEvent",
    "addTags",
    "removeTags",
    "showWidget",
    "hideWidget",
    "toggleVisibility",
    "maximize",
    "minimize",
    "toggle",
    "popup",
    "endChat",
    "start",
    "login",
    "logout",
    "switchWidget",
  ] as const) {
    tawk[m] = (...args: unknown[]) => log.push({ name: m, args })
  }
  tawk["getStatus"] = () => "online"
  tawk["getWindowType"] = () => "embed"
  tawk["isChatMaximized"] = () => true
  tawk["isChatMinimized"] = () => false
  tawk["isChatHidden"] = () => false
  tawk["isChatOngoing"] = () => true
  tawk["isVisitorEngaged"] = () => true
  return tawk
}

async function bootTawk(
  log: CallLog[],
  options?: Partial<import("../src/providers/tawk.ts").TawkLoadOptions>,
): Promise<{
  tawk: typeof import("../src/providers/tawk.ts")
  api: Record<string, unknown>
}> {
  const tawk = await import("../src/providers/tawk.ts")
  const loadPromise = tawk.load({ propertyId: "prop_xyz", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-tawk") as HTMLScriptElement
  expect(script).toBeTruthy()

  // Tawk's CDN normally provides the methods; we mount them now.
  const api = setupFakeApi(log)

  // Tawk's onLoad is what queues callers — fire it to mark ready.
  ;(api["onLoad"] as () => void)?.()

  script.dispatchEvent(new Event("load"))
  await loadPromise
  return { tawk, api }
}

describe("tawk (browser) — vendor-doc audit fixes (#93)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).Tawk_API
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).Tawk_LoadStart
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("visitor preload writes Tawk_API.visitor before script load", async () => {
    // Need to inspect Tawk_API.visitor BEFORE the script callbacks run.
    const tawkProvider = await import("../src/providers/tawk.ts")
    const loadPromise = tawkProvider.load({
      propertyId: "prop_xyz",
      visitor: { name: "Mehmet", email: "m@example.com", hash: "abc", phone: "+90555" },
    })
    await new Promise((r) => setTimeout(r, 0))
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const visitor = (globalThis as any).Tawk_API.visitor as Record<string, unknown>
    expect(visitor).toMatchObject({
      name: "Mehmet",
      email: "m@example.com",
      hash: "abc",
      phone: "+90555",
    })
    // Finish boot
    const log: CallLog[] = []
    const api = setupFakeApi(log)
    ;(api["onLoad"] as () => void)?.()
    const script = document.getElementById("ahize-tawk") as HTMLScriptElement
    script.dispatchEvent(new Event("load"))
    await loadPromise
    await tawkProvider.destroy()
  })

  it("customStyleZIndex + autoStart + onBeforeLoad propagate", async () => {
    let beforeLoadCalled = false
    const tawkProvider = await import("../src/providers/tawk.ts")
    const loadPromise = tawkProvider.load({
      propertyId: "prop_xyz",
      customStyleZIndex: 9999,
      autoStart: false,
      onBeforeLoad: () => {
        beforeLoadCalled = true
      },
    })
    await new Promise((r) => setTimeout(r, 0))
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const tawkApi = (globalThis as any).Tawk_API as Record<string, unknown>
    expect(tawkApi["customStyle"]).toMatchObject({ zIndex: 9999 })
    expect(tawkApi["autoStart"]).toBe(false)
    ;(tawkApi["onBeforeLoad"] as () => void)?.()
    expect(beforeLoadCalled).toBe(true)

    // Finish boot
    const log: CallLog[] = []
    const api = setupFakeApi(log)
    ;(api["onLoad"] as () => void)?.()
    const script = document.getElementById("ahize-tawk") as HTMLScriptElement
    script.dispatchEvent(new Event("load"))
    await loadPromise
    await tawkProvider.destroy()
  })

  it("forwards new methods (maximize/popup/addTags/login/etc)", async () => {
    const log: CallLog[] = []
    const { tawk } = await bootTawk(log)

    await tawk.maximize()
    await tawk.minimize()
    await tawk.toggle()
    await tawk.popup()
    await tawk.toggleVisibility()
    await tawk.start({ showWidget: true })
    await tawk.addTags(["beta", "vip"])
    await tawk.removeTags(["beta"])
    await tawk.login({ email: "x@y", hash: "h", userId: "u1" })
    await tawk.logout()

    const names = log.map((c) => c.name)
    for (const m of [
      "maximize",
      "minimize",
      "toggle",
      "popup",
      "toggleVisibility",
      "start",
      "addTags",
      "removeTags",
      "login",
      "logout",
    ]) {
      expect(names).toContain(m)
    }
  })

  it("identify() includes phone in setAttributes", async () => {
    const log: CallLog[] = []
    const { tawk } = await bootTawk(log)
    await tawk.identify({ id: "u1", phone: "+90555111", email: "x@y" })
    const attrCall = log.find((c) => c.name === "setAttributes")
    expect(attrCall?.args[0]).toMatchObject({ phone: "+90555111", email: "x@y" })
  })

  it("sync getters return values directly", async () => {
    const log: CallLog[] = []
    const { tawk } = await bootTawk(log)
    expect(tawk.getStatus()).toBe("online")
    expect(tawk.getWindowType()).toBe("embed")
    expect(tawk.isChatMaximized()).toBe(true)
    expect(tawk.isChatMinimized()).toBe(false)
    expect(tawk.isChatOngoing()).toBe(true)
    expect(tawk.isVisitorEngaged()).toBe(true)
  })

  it("on() bridges hooks to multi-listener subscribers", async () => {
    const log: CallLog[] = []
    const { tawk, api } = await bootTawk(log)

    let started = 0
    let messageCount = 0
    let lastMsg: unknown
    tawk.on("chatStarted", () => {
      started++
    })
    tawk.on("chatMessageVisitor", (m) => {
      messageCount++
      lastMsg = m
    })

    ;(api["onChatStarted"] as () => void)?.()
    ;(api["onChatMessageVisitor"] as (m: string) => void)?.("merhaba")

    expect(started).toBe(1)
    expect(messageCount).toBe(1)
    expect(lastMsg).toBe("merhaba")
  })
})
