// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"

interface BeaconCall {
  method: string
  args: unknown[]
}

function recorderBeacon(calls: BeaconCall[]): (method: string, ...args: unknown[]) => unknown {
  return (method, ...args) => {
    calls.push({ method, args })
    if (method === "on" && args[0] === "ready" && typeof args[1] === "function") {
      ;(args[1] as () => void)()
    }
    if (method === "info") return { open: false, beaconId: "test" }
    return undefined
  }
}

async function bootHelpScout(
  calls: BeaconCall[],
  options?: Partial<import("../src/providers/helpscout.ts").HelpScoutLoadOptions>,
): Promise<typeof import("../src/providers/helpscout.ts")> {
  const helpscout = await import("../src/providers/helpscout.ts")
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).Beacon = recorderBeacon(calls)
  const loadPromise = helpscout.load({ beaconId: "bid_xyz", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-helpscout") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await loadPromise
  return helpscout
}

describe("helpscout (browser) — vendor-doc audit fixes (#84)", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).Beacon
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("init forwards a config object when provided", async () => {
    const calls: BeaconCall[] = []
    const helpscout = await bootHelpScout(calls, {
      config: {
        color: "#abcdef",
        mode: "askFirst",
        display: { style: "iconAndText", position: "left", zIndex: 99 },
        labels: { greeting: "Selam" },
      },
    })
    const initCall = calls.find((c) => c.method === "init")
    expect(initCall).toBeTruthy()
    expect(initCall?.args[0]).toMatchObject({
      beaconId: "bid_xyz",
      color: "#abcdef",
      mode: "askFirst",
      display: { style: "iconAndText", position: "left", zIndex: 99 },
      labels: { greeting: "Selam" },
    })
    await helpscout.destroy()
  })

  it("init falls back to bare beaconId when no config", async () => {
    const calls: BeaconCall[] = []
    const helpscout = await bootHelpScout(calls)
    const initCall = calls.find((c) => c.method === "init")
    expect(initCall?.args).toEqual(["bid_xyz"])
    await helpscout.destroy()
  })

  it("forwards search/article/sessionData/config/reset/toggle/askQuestion/showMessage", async () => {
    const calls: BeaconCall[] = []
    const helpscout = await bootHelpScout(calls)

    await helpscout.search("how to refund")
    await helpscout.article("art_1", { type: "modal" })
    await helpscout.sessionData({ plan: "pro", country: "TR" })
    await helpscout.config({ color: "#000" })
    await helpscout.reset()
    await helpscout.toggle()
    await helpscout.askQuestion("Where is my order?")
    await helpscout.showMessage("msg_1", { delay: 500, force: true })

    const methods = calls.map((c) => c.method)
    expect(methods).toContain("search")
    expect(methods).toContain("article")
    expect(methods).toContain("session-data")
    expect(methods).toContain("config")
    expect(methods).toContain("reset")
    expect(methods).toContain("toggle")
    expect(methods).toContain("ask-question")
    expect(methods).toContain("show-message")

    expect(calls.find((c) => c.method === "article")?.args).toEqual(["art_1", { type: "modal" }])
    expect(calls.find((c) => c.method === "show-message")?.args).toEqual([
      "msg_1",
      { delay: 500, force: true },
    ])
    await helpscout.destroy()
  })

  it("info() returns the Beacon synchronous result", async () => {
    const calls: BeaconCall[] = []
    const helpscout = await bootHelpScout(calls)
    const result = await helpscout.info()
    expect(result).toEqual({ open: false, beaconId: "test" })
    await helpscout.destroy()
  })

  it("on('search'|'message-clicked'|'message-closed'|'message-triggered') subscribes via Beacon", async () => {
    const calls: BeaconCall[] = []
    const helpscout = await bootHelpScout(calls)

    helpscout.on("search", () => {})
    helpscout.on("message-clicked", () => {})
    helpscout.on("message-closed", () => {})
    helpscout.on("message-triggered", () => {})
    await new Promise((r) => setTimeout(r, 0))

    const subscribed = calls.filter((c) => c.method === "on").map((c) => c.args[0])
    expect(subscribed).toContain("search")
    expect(subscribed).toContain("message-clicked")
    expect(subscribed).toContain("message-closed")
    expect(subscribed).toContain("message-triggered")
    await helpscout.destroy()
  })

  it("once() registers a one-shot Beacon listener", async () => {
    const calls: BeaconCall[] = []
    const helpscout = await bootHelpScout(calls)
    helpscout.once("open", () => {})
    await new Promise((r) => setTimeout(r, 0))
    const onceCall = calls.find((c) => c.method === "once")
    expect(onceCall?.args[0]).toBe("open")
    await helpscout.destroy()
  })

  it("shutdown forwards clearMessages when provided", async () => {
    const calls: BeaconCall[] = []
    const helpscout = await bootHelpScout(calls)
    await helpscout.shutdown({ endActiveChat: false, clearMessages: true })
    const logoutCall = calls.find((c) => c.method === "logout")
    expect(logoutCall?.args[0]).toEqual({ endActiveChat: false, clearMessages: true })
    await helpscout.destroy()
  })

  it("prefill accepts attachments", async () => {
    const calls: BeaconCall[] = []
    const helpscout = await bootHelpScout(calls)
    await helpscout.prefill({
      name: "x",
      attachments: [{ url: "https://x/a.png", filename: "a.png" }],
    })
    const prefill = calls.find((c) => c.method === "prefill")
    expect(prefill?.args[0]).toMatchObject({
      attachments: [{ url: "https://x/a.png", filename: "a.png" }],
    })
    await helpscout.destroy()
  })
})
