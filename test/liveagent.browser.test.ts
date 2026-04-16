// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface CallLog {
  name: string
  args: unknown[]
}

interface FakeButton {
  onClick?: () => void
  onCloseFunction_?: () => void
  onOnline?: () => void
  onOffline?: () => void
}

async function bootLiveAgent(
  options?: Partial<import("../src/providers/liveagent.ts").LiveAgentLoadOptions>,
): Promise<{
  liveagent: typeof import("../src/providers/liveagent.ts")
  log: CallLog[]
  button: FakeButton
  api: Record<string, unknown>
}> {
  const liveagent = await import("../src/providers/liveagent.ts")
  const log: CallLog[] = []
  const rec =
    (name: string) =>
    (...args: unknown[]) =>
      log.push({ name, args })
  const button: FakeButton = {}
  const api: Record<string, unknown> = {
    setUserDetails: rec("setUserDetails"),
    addUserDetail: rec("addUserDetail"),
    addContactField: rec("addContactField"),
    addTicketField: rec("addTicketField"),
    clearAllUserDetails: rec("clearAllUserDetails"),
    setVisitorLocation: rec("setVisitorLocation"),
    disableOnlineVisitorsTracking: rec("disableOnlineVisitorsTracking"),
    createButton: (...args: unknown[]) => {
      log.push({ name: "createButton", args })
      return button
    },
    createForm: rec("createForm"),
    hideButton: rec("hideButton"),
    instance: { hasOpenedWidget: () => true },
  }
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).LiveAgent = api
  const loadPromise = liveagent.load({
    accountSubdomain: "yourcompany",
    buttonId: "btn_xyz",
    ...options,
  })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-liveagent") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await new Promise((r) => setTimeout(r, 60))
  await loadPromise
  return { liveagent, log, button, api }
}

describe("liveagent (browser) — vendor-doc audit fixes (#88)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).LiveAgent
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("disableOnlineVisitorsTracking: true is called before createButton", async () => {
    const { liveagent, log } = await bootLiveAgent({ disableOnlineVisitorsTracking: true })
    const disableIdx = log.findIndex((c) => c.name === "disableOnlineVisitorsTracking")
    const createIdx = log.findIndex((c) => c.name === "createButton")
    expect(disableIdx).toBeGreaterThanOrEqual(0)
    expect(createIdx).toBeGreaterThan(disableIdx)
    await liveagent.destroy()
  })

  it("addUserDetail/addTicketField/clearAllUserDetails/setVisitorLocation/createForm forward", async () => {
    const { liveagent, log } = await bootLiveAgent()
    log.length = 0
    await liveagent.addUserDetail("email", "u@example.com")
    await liveagent.addTicketField("priority", "high")
    await liveagent.clearAllUserDetails()
    await liveagent.setVisitorLocation("/checkout")
    await liveagent.createForm("form_1")
    const names = log.map((c) => c.name)
    for (const m of [
      "addUserDetail",
      "addTicketField",
      "clearAllUserDetails",
      "setVisitorLocation",
      "createForm",
    ]) {
      expect(names).toContain(m)
    }
    await liveagent.destroy()
  })

  it("pageView({path}) calls setVisitorLocation", async () => {
    const { liveagent, log } = await bootLiveAgent()
    log.length = 0
    await liveagent.pageView({ path: "/products/123" })
    const call = log.find((c) => c.name === "setVisitorLocation")
    expect(call?.args).toEqual(["/products/123"])
    await liveagent.destroy()
  })

  it("hasOpenedWidget reads from LiveAgent.instance", async () => {
    const { liveagent } = await bootLiveAgent()
    expect(liveagent.hasOpenedWidget()).toBe(true)
    await liveagent.destroy()
  })

  it("on(chatStarted/chatEnded/online/offline) bridges button callbacks", async () => {
    const { liveagent, button } = await bootLiveAgent()
    let started = 0
    let ended = 0
    let online = 0
    let offline = 0
    liveagent.on("chatStarted", () => {
      started++
    })
    liveagent.on("chatEnded", () => {
      ended++
    })
    liveagent.on("online", () => {
      online++
    })
    liveagent.on("offline", () => {
      offline++
    })

    button.onClick?.()
    button.onCloseFunction_?.()
    button.onOnline?.()
    button.onOffline?.()

    expect(started).toBe(1)
    expect(ended).toBe(1)
    expect(online).toBe(1)
    expect(offline).toBe(1)
    await liveagent.destroy()
  })

  it("shutdown() calls clearAllUserDetails", async () => {
    const { liveagent, log } = await bootLiveAgent()
    log.length = 0
    await liveagent.shutdown()
    expect(log.find((c) => c.name === "clearAllUserDetails")).toBeDefined()
    await liveagent.destroy()
  })
})
