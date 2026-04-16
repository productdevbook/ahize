// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface FakeWidget {
  init: (opts: Record<string, unknown>) => void
  initOpts: Record<string, unknown> | null
  on: (event: string, cb: (p: unknown) => void) => void
  off: (event: string, cb: (p: unknown) => void) => void
  user: {
    setProperties: (p: Record<string, unknown>) => void
    update: (u: unknown) => void
    clear: () => void
    setEmail: (e: string) => void
    setFirstName: (n: string) => void
    setLastName: (n: string) => void
    setPhone: (p: string) => void
    setLocale: (l: string) => void
  }
  setExternalId: (id: string) => void
  setJWTAuthToken: (t: string) => void
  setConfig: (c: Record<string, unknown>) => void
  setTags: (t: string[]) => void
  setFaqTags: (p: { tags: string[]; filterType?: string }) => void
  trackPage: (url: string, title?: string) => void
  isOpen: () => boolean
  isLoaded: () => boolean
  conversation: {
    setBotVariables: (v: Record<string, unknown>) => void
    setConversationProperties: (p: Record<string, unknown>) => void
  }
  show: () => void
  hide: () => void
  open: (opts?: { name?: string }) => void
  close: () => void
  destroy: () => void
  isInitialized: () => boolean
  fire: (event: string, payload?: unknown) => void
  log: Array<{ name: string; args: unknown[] }>
}

function fakeWidget(): FakeWidget {
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  const log: Array<{ name: string; args: unknown[] }> = []
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      log.push({ name, args })
    }

  const w: FakeWidget = {
    initOpts: null,
    init: (opts) => {
      w.initOpts = opts
    },
    on: (event, cb) => {
      const arr = handlers.get(event) ?? []
      arr.push(cb)
      handlers.set(event, arr)
    },
    off: () => {},
    user: {
      setProperties: rec("user.setProperties"),
      update: rec("user.update"),
      clear: rec("user.clear"),
      setEmail: rec("user.setEmail"),
      setFirstName: rec("user.setFirstName"),
      setLastName: rec("user.setLastName"),
      setPhone: rec("user.setPhone"),
      setLocale: rec("user.setLocale"),
    },
    setExternalId: rec("setExternalId"),
    setJWTAuthToken: rec("setJWTAuthToken"),
    setConfig: rec("setConfig"),
    setTags: rec("setTags"),
    setFaqTags: rec("setFaqTags"),
    trackPage: rec("trackPage"),
    isOpen: () => true,
    isLoaded: () => true,
    conversation: {
      setBotVariables: rec("conversation.setBotVariables"),
      setConversationProperties: rec("conversation.setConversationProperties"),
    },
    show: rec("show"),
    hide: rec("hide"),
    open: rec("open"),
    close: rec("close"),
    destroy: rec("destroy"),
    isInitialized: () => true,
    fire: (event, payload) => {
      for (const cb of handlers.get(event) ?? []) cb(payload)
    },
    log,
  }
  return w
}

async function bootFreshchat(
  options?: Partial<import("../src/providers/freshchat.ts").FreshchatLoadOptions>,
): Promise<{
  freshchat: typeof import("../src/providers/freshchat.ts")
  widget: FakeWidget
}> {
  const freshchat = await import("../src/providers/freshchat.ts")
  const widget = fakeWidget()
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).fcWidget = widget
  const loadPromise = freshchat.load({ token: "tok_xyz", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-freshchat") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  // Wait for the widget-detection polling iteration to find the global.
  await new Promise((r) => setTimeout(r, 60))
  // Once the wrapper subscribed to widget:loaded, fire it to resolve ready.
  widget.fire("widget:loaded")
  await loadPromise
  return { freshchat, widget }
}

describe("freshchat (browser) — vendor-doc audit fixes (#82)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).fcWidget
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).fcSettings
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("region shorthand resolves to the right host", async () => {
    const { freshchat } = await bootFreshchat({ region: "in" })
    const script = document.getElementById("ahize-freshchat") as HTMLScriptElement
    expect(script.src).toContain("wchat.in.freshchat.com")
    await freshchat.destroy()
  })

  it("init payload carries siteId/locale/tags/faqTags/conversationReferenceId/open", async () => {
    const { freshchat, widget } = await bootFreshchat({
      siteId: "site_1",
      locale: "tr-TR",
      tags: ["billing"],
      faqTags: { tags: ["welcome"], filterType: "category" },
      conversationReferenceId: "ref_42",
      open: true,
    })
    expect(widget.initOpts).toMatchObject({
      siteId: "site_1",
      locale: "tr-TR",
      tags: ["billing"],
      faqTags: { tags: ["welcome"], filterType: "category" },
      conversationReferenceId: "ref_42",
      open: true,
    })
    await freshchat.destroy()
  })

  it("show()/hide() use widget.show/hide; open()/close() use widget.open/close", async () => {
    const { freshchat, widget } = await bootFreshchat()
    widget.log.length = 0
    await freshchat.show()
    await freshchat.hide()
    await freshchat.open({ name: "panel" })
    await freshchat.close()
    expect(widget.log.map((c) => c.name)).toEqual(["show", "hide", "open", "close"])
    await freshchat.destroy()
  })

  it("setLocale/setTags/setFaqTags/setConfig/setBotVariables/setConversationProperties/trackPage forward", async () => {
    const { freshchat, widget } = await bootFreshchat()
    widget.log.length = 0
    await freshchat.setLocale("tr")
    await freshchat.setTags(["vip"])
    await freshchat.setFaqTags({ tags: ["billing"] })
    await freshchat.setConfig({ disableNotifications: true })
    await freshchat.setBotVariables({ plan: "pro" })
    await freshchat.setConversationProperties({ priority: "high" })
    await freshchat.trackPage("/checkout", "Checkout")
    const names = widget.log.map((c) => c.name)
    for (const m of [
      "user.setLocale",
      "setTags",
      "setFaqTags",
      "setConfig",
      "conversation.setBotVariables",
      "conversation.setConversationProperties",
      "trackPage",
    ]) {
      expect(names).toContain(m)
    }
    await freshchat.destroy()
  })

  it("on(event) bridges widget:opened/messageSent/unreadCountNotify/etc", async () => {
    const { freshchat, widget } = await bootFreshchat()
    let openedHits = 0
    let lastSent: unknown
    let unread = 0
    freshchat.on("widgetOpened", () => {
      openedHits++
    })
    freshchat.on("messageSent", (p) => {
      lastSent = p
    })
    freshchat.onUnreadCountChange((c) => {
      unread = c
    })

    widget.fire("widget:opened")
    widget.fire("message:sent", { content: "hi" })
    widget.fire("unreadCount:notify", { count: 7 })

    expect(openedHits).toBe(1)
    expect(lastSent).toEqual({ content: "hi" })
    expect(unread).toBe(7)
    await freshchat.destroy()
  })

  it("isOpen() / isLoaded() return widget state", async () => {
    const { freshchat } = await bootFreshchat()
    expect(freshchat.isOpen()).toBe(true)
    expect(freshchat.isLoaded()).toBe(true)
    await freshchat.destroy()
  })

  it("pageView({path,locale}) calls trackPage + user.setLocale", async () => {
    const { freshchat, widget } = await bootFreshchat()
    widget.log.length = 0
    await freshchat.pageView({ path: "/home", locale: "tr" })
    const names = widget.log.map((c) => c.name)
    expect(names).toContain("trackPage")
    expect(names).toContain("user.setLocale")
    await freshchat.destroy()
  })
})
