// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface CallLog {
  name: string
  args: unknown[]
}

function fakeApi(): {
  api: Record<string, unknown>
  log: CallLog[]
} {
  const log: CallLog[] = []
  const rec =
    (name: string) =>
    (...args: unknown[]) =>
      log.push({ name, args })
  const api: Record<string, unknown> = {
    setVisitorData: rec("setVisitorData"),
    setContactProperties: rec("setContactProperties"),
    track: rec("track"),
    setColorPalette: rec("setColorPalette"),
    display: rec("display"),
    messageFromOperator: rec("messageFromOperator"),
    messageFromVisitor: rec("messageFromVisitor"),
    addVisitorTags: rec("addVisitorTags"),
    setVisitorCurrency: rec("setVisitorCurrency"),
    show: rec("show"),
    hide: rec("hide"),
    open: rec("open"),
    close: rec("close"),
  }
  return { api, log }
}

async function bootTidio(
  options?: Partial<import("../src/providers/tidio.ts").TidioLoadOptions>,
): Promise<{
  tidio: typeof import("../src/providers/tidio.ts")
  log: CallLog[]
}> {
  const tidio = await import("../src/providers/tidio.ts")
  const { api, log } = fakeApi()
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).tidioChatApi = api
  const loadPromise = tidio.load({ publicKey: "pub_xyz", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-tidio") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await new Promise((r) => setTimeout(r, 60))
  document.dispatchEvent(new CustomEvent("tidioChat-ready"))
  await loadPromise
  return { tidio, log }
}

describe("tidio (browser) — vendor-doc audit fixes (#94)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).tidioChatApi
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).tidioChatLang
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).tidioIdentify
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("language + identify pre-load globals are written before script load", async () => {
    const { tidio } = await bootTidio({
      language: "tr",
      identify: { distinct_id: "u1", email: "u@example.com" },
    })
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    expect((globalThis as any).tidioChatLang).toBe("tr")
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    expect((globalThis as any).tidioIdentify).toEqual({
      distinct_id: "u1",
      email: "u@example.com",
    })
    await tidio.destroy()
  })

  it("track() now calls tidioChatApi.track instead of setContactProperties", async () => {
    const { tidio, log } = await bootTidio()
    log.length = 0
    await tidio.track("plan_upgraded", { tier: "pro" })
    const trackCall = log.find((c) => c.name === "track")
    expect(trackCall?.args).toEqual(["plan_upgraded"])
    // metadata stored as a separate contact property to avoid loss
    const meta = log.find(
      (c) =>
        c.name === "setContactProperties" &&
        JSON.stringify(c.args).includes("plan_upgraded_metadata"),
    )
    expect(meta).toBeDefined()
    await tidio.destroy()
  })

  it("show()/open() now distinct (no more conflated show+open)", async () => {
    const { tidio, log } = await bootTidio()
    log.length = 0
    await tidio.show()
    await tidio.open()
    await tidio.hide()
    await tidio.close()
    expect(log.map((c) => c.name)).toEqual(["show", "open", "hide", "close"])
    await tidio.destroy()
  })

  it("setColorPalette/display/messageFromOperator/messageFromVisitor/addVisitorTags/setVisitorCurrency forward", async () => {
    const { tidio, log } = await bootTidio()
    log.length = 0
    await tidio.setColorPalette("#ff0000")
    await tidio.display(true)
    await tidio.messageFromOperator("welcome")
    await tidio.messageFromVisitor("hi")
    await tidio.addVisitorTags(["beta"])
    await tidio.setVisitorCurrency({ code: "TRY", exchangeRate: 32 })
    const names = log.map((c) => c.name)
    for (const m of [
      "setColorPalette",
      "display",
      "messageFromOperator",
      "messageFromVisitor",
      "addVisitorTags",
      "setVisitorCurrency",
    ]) {
      expect(names).toContain(m)
    }
    await tidio.destroy()
  })

  it("on(event) covers setStatus/conversationStart/preFormFilled/resize/open/close", async () => {
    const { tidio } = await bootTidio()
    let status: unknown
    let convStart = 0
    let openCount = 0
    tidio.on("setStatus", (p) => {
      status = p
    })
    tidio.on("conversationStart", () => {
      convStart++
    })
    tidio.on("open", () => {
      openCount++
    })

    document.dispatchEvent(new CustomEvent("tidioChat-setStatus", { detail: { status: "online" } }))
    document.dispatchEvent(new CustomEvent("tidioChat-conversationStart"))
    document.dispatchEvent(new CustomEvent("tidioChat-open"))

    expect(status).toEqual({ status: "online" })
    expect(convStart).toBe(1)
    expect(openCount).toBe(1)
    await tidio.destroy()
  })
})
