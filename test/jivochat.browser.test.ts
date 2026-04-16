// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface CallLog {
  name: string
  args: unknown[]
}

function fakeApi(): { api: Record<string, unknown>; log: CallLog[] } {
  const log: CallLog[] = []
  const rec =
    (name: string) =>
    (...args: unknown[]) =>
      log.push({ name, args })
  const api: Record<string, unknown> = {
    setContactInfo: rec("setContactInfo"),
    setUserToken: rec("setUserToken"),
    setClientAttributes: rec("setClientAttributes"),
    setCustomData: rec("setCustomData"),
    setWidgetColor: rec("setWidgetColor"),
    sendPageTitle: rec("sendPageTitle"),
    sendOfflineMessage: rec("sendOfflineMessage"),
    showProactiveInvitation: rec("showProactiveInvitation"),
    startCall: rec("startCall"),
    open: rec("open"),
    close: rec("close"),
    clearHistory: rec("clearHistory"),
    chatMode: () => "online",
    getUnreadMessagesCount: () => 3,
    getUtm: () => ({ source: "google" }),
    getContactInfo: () => ({ name: "X" }),
    getVisitorNumber: (cb: (n: number) => void) => cb(42),
  }
  return { api, log }
}

async function bootJivoChat(): Promise<{
  jivochat: typeof import("../src/providers/jivochat.ts")
  log: CallLog[]
  api: Record<string, unknown>
}> {
  const jivochat = await import("../src/providers/jivochat.ts")
  const { api, log } = fakeApi()
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).jivo_api = api
  const loadPromise = jivochat.load({ widgetId: "wid_xyz" })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-jivochat") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await new Promise((r) => setTimeout(r, 60))
  // biome-ignore lint/suspicious/noExplicitAny: test inspect
  ;(globalThis as any).jivo_onLoadCallback?.()
  await loadPromise
  return { jivochat, log, api }
}

describe("jivochat (browser) — vendor-doc audit fixes (#87)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).jivo_api
    for (const k of [
      "jivo_onLoadCallback",
      "jivo_onOpen",
      "jivo_onClose",
      "jivo_onMessageSent",
      "jivo_onMessageReceived",
      "jivo_onChangeState",
      "jivo_onClientStartChat",
      "jivo_onIntroduction",
      "jivo_onAccept",
      "jivo_onCallStart",
      "jivo_onCallEnd",
      "jivo_onResizeCallback",
      "jivo_onWidgetDestroy",
    ]) {
      // biome-ignore lint/suspicious/noExplicitAny: test cleanup
      delete (globalThis as any)[k]
    }
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("identify() is no longer rate-limited (setContactInfo has no documented limit)", async () => {
    const { jivochat, log } = await bootJivoChat()
    log.length = 0
    // 11 calls back-to-back; previously the 12th would have been throttled.
    for (let i = 0; i < 11; i++) {
      await jivochat.identify({ id: `u${i}`, email: `u${i}@x` })
    }
    const calls = log.filter((c) => c.name === "setContactInfo")
    expect(calls).toHaveLength(11)
    await jivochat.destroy()
  })

  it("setClientAttributes IS rate-limited at 10/hr per vendor docs", async () => {
    const { jivochat, log } = await bootJivoChat()
    log.length = 0
    const warnings: string[] = []
    const orig = console.warn
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]))
    try {
      for (let i = 0; i < 12; i++) {
        await jivochat.setClientAttributes({ attempt: i })
      }
    } finally {
      console.warn = orig
    }
    const calls = log.filter((c) => c.name === "setClientAttributes")
    expect(calls).toHaveLength(10)
    expect(warnings.some((w) => w.includes("throttled"))).toBe(true)
    await jivochat.destroy()
  })

  it("show({ start }) deep-links to call/menu and pageView({path}) calls sendPageTitle", async () => {
    const { jivochat, log } = await bootJivoChat()
    log.length = 0
    await jivochat.show({ start: "call" })
    await jivochat.pageView({ path: "/checkout" })
    expect(log.find((c) => c.name === "open")?.args).toEqual([{ start: "call" }])
    expect(log.find((c) => c.name === "sendPageTitle")?.args[2]).toBe("/checkout")
    await jivochat.destroy()
  })

  it("setCustomData / startCall / sendOfflineMessage / showProactiveInvitation / setWidgetColor / clearHistory forward", async () => {
    const { jivochat, log } = await bootJivoChat()
    log.length = 0
    await jivochat.setCustomData([{ title: "plan", content: "pro" }])
    await jivochat.startCall("+90555")
    await jivochat.sendOfflineMessage({ email: "x@y", message: "hi" })
    await jivochat.showProactiveInvitation("welcome", 7)
    await jivochat.setWidgetColor("#ff0000", "#00ff00")
    await jivochat.clearHistory()
    const names = log.map((c) => c.name)
    for (const m of [
      "setCustomData",
      "startCall",
      "sendOfflineMessage",
      "showProactiveInvitation",
      "setWidgetColor",
      "clearHistory",
    ]) {
      expect(names).toContain(m)
    }
    await jivochat.destroy()
  })

  it("sync getters chatMode/getUnreadMessagesCount/getUtm/getContactInfo + async getVisitorNumber", async () => {
    const { jivochat } = await bootJivoChat()
    expect(jivochat.chatMode()).toBe("online")
    expect(jivochat.getUnreadMessagesCount()).toBe(3)
    expect(jivochat.getUtm()).toEqual({ source: "google" })
    expect(jivochat.getContactInfo()).toEqual({ name: "X" })
    expect(await jivochat.getVisitorNumber()).toBe(42)
    await jivochat.destroy()
  })

  it("on() bridges new events (messageReceived/stateChange/callStart/etc)", async () => {
    const { jivochat } = await bootJivoChat()
    let lastReceived: unknown
    let stateCount = 0
    let callStarts = 0
    jivochat.on("messageReceived", (m) => {
      lastReceived = m
    })
    jivochat.on("stateChange", () => {
      stateCount++
    })
    jivochat.on("callStart", () => {
      callStarts++
    })

    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    ;(globalThis as any).jivo_onMessageReceived?.({ id: 5 })
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    ;(globalThis as any).jivo_onChangeState?.("chat")
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    ;(globalThis as any).jivo_onCallStart?.()

    expect(lastReceived).toEqual({ id: 5 })
    expect(stateCount).toBe(1)
    expect(callStarts).toBe(1)
    await jivochat.destroy()
  })

  it("shutdown() no longer calls clearHistory (destructive)", async () => {
    const { jivochat, log } = await bootJivoChat()
    log.length = 0
    await jivochat.shutdown()
    expect(log.find((c) => c.name === "clearHistory")).toBeUndefined()
    await jivochat.destroy()
  })
})
