// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface CallLog {
  name: "call" | "on"
  args: unknown[]
}

async function bootLiveChat(
  options?: Partial<import("../src/providers/livechat.ts").LiveChatLoadOptions>,
): Promise<{
  livechat: typeof import("../src/providers/livechat.ts")
  log: CallLog[]
  fire: (event: string, payload?: unknown) => void
  getReturns: Map<string, unknown>
}> {
  const livechat = await import("../src/providers/livechat.ts")
  const log: CallLog[] = []
  const handlers = new Map<string, Array<(p?: unknown) => void>>()
  const getReturns = new Map<string, unknown>()
  const widget = {
    call: (...args: unknown[]) => log.push({ name: "call", args }),
    on: (event: string, cb: (p?: unknown) => void) => {
      log.push({ name: "on", args: [event] })
      const arr = handlers.get(event) ?? []
      arr.push(cb)
      handlers.set(event, arr)
    },
    off: () => {},
    get: <T>(method: string) => getReturns.get(method) as T,
  }
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).LiveChatWidget = widget
  const loadPromise = livechat.load({ license: 12345, ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-livechat") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await new Promise((r) => setTimeout(r, 60))
  // Fire ready so the wrapper resolves.
  for (const cb of handlers.get("ready") ?? []) cb()
  await loadPromise
  const fire = (event: string, payload?: unknown) => {
    for (const cb of handlers.get(event) ?? []) cb(payload)
  }
  return { livechat, log, fire, getReturns }
}

describe("livechat (browser) — vendor-doc audit fixes (#89)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).LiveChatWidget
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).__lc
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("typed __lc keys (group/visibility/etc) propagate", async () => {
    const { livechat } = await bootLiveChat({
      group: 7,
      visibility: "minimized",
      sessionVariables: { plan: "pro" },
      customerName: "Mehmet",
      customerEmail: "m@example.com",
      chatBetweenGroups: true,
      asyncInit: true,
    })
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const lc = (globalThis as any).__lc as Record<string, unknown>
    expect(lc).toMatchObject({
      group: 7,
      visibility: "minimized",
      sessionVariables: { plan: "pro" },
      customerName: "Mehmet",
      customerEmail: "m@example.com",
      chatBetweenGroups: true,
      asyncInit: true,
      product_name: "ahize",
    })
    await livechat.destroy()
  })

  it("maximize(messageDraft)/minimize/hideGreeting/triggerSalesTracker/setSessionVariables forward", async () => {
    const { livechat, log } = await bootLiveChat()
    log.length = 0
    await livechat.maximize("draft text")
    await livechat.minimize()
    await livechat.hideGreeting()
    await livechat.triggerSalesTracker({ trackerId: 1, orderPrice: 99, orderId: "ord_1" })
    await livechat.setSessionVariables({ utm: "google" })

    const calls = log.filter((c) => c.name === "call").map((c) => c.args)
    expect(calls).toContainEqual(["maximize", "draft text"])
    expect(calls).toContainEqual(["minimize"])
    expect(calls).toContainEqual(["hide_greeting"])
    expect(calls).toContainEqual([
      "trigger_sales_tracker",
      { trackerId: 1, orderPrice: 99, orderId: "ord_1" },
    ])
    expect(calls).toContainEqual(["set_session_variables", { utm: "google" }])
    await livechat.destroy()
  })

  it("get() / getState / getCustomerData / getChatData read from widget.get", async () => {
    const { livechat, getReturns } = await bootLiveChat()
    getReturns.set("state", { availability: "online" })
    getReturns.set("customer_data", { id: "u1" })
    getReturns.set("chat_data", { chatId: "c1" })
    expect(livechat.getState()).toEqual({ availability: "online" })
    expect(livechat.getCustomerData()).toEqual({ id: "u1" })
    expect(livechat.getChatData()).toEqual({ chatId: "c1" })
    await livechat.destroy()
  })

  it("on() bridges availability/visibility/customer_status/new_event/etc", async () => {
    const { livechat, fire } = await bootLiveChat()
    let availability: unknown
    let lastForm: unknown
    let ratingCount = 0
    livechat.on("availabilityChanged", (p) => {
      availability = p
    })
    livechat.on("formSubmitted", (p) => {
      lastForm = p
    })
    livechat.on("ratingSubmitted", () => {
      ratingCount++
    })

    fire("availability_changed", { availability: "online" })
    fire("form_submitted", { type: "prechat" })
    fire("rating_submitted", "good")

    expect(availability).toEqual({ availability: "online" })
    expect(lastForm).toEqual({ type: "prechat" })
    expect(ratingCount).toBe(1)
    await livechat.destroy()
  })
})
