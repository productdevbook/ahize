// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

interface FakeGist {
  identify: (...args: unknown[]) => void
  track: (...args: unknown[]) => void
  trackEvent: (...args: unknown[]) => void
  trackPageView: () => void
  chat: (...args: unknown[]) => void
  trigger: (...args: unknown[]) => void
  shutdown: () => void
  log: Array<{ name: string; args: unknown[] }>
}

function fakeGist(): FakeGist {
  const log: Array<{ name: string; args: unknown[] }> = []
  const rec =
    (name: string) =>
    (...args: unknown[]) =>
      log.push({ name, args })
  return {
    identify: rec("identify"),
    track: rec("track"),
    trackEvent: rec("trackEvent"),
    trackPageView: () => log.push({ name: "trackPageView", args: [] }),
    chat: rec("chat"),
    trigger: rec("trigger"),
    shutdown: () => log.push({ name: "shutdown", args: [] }),
    log,
  }
}

async function bootGist(
  options?: Partial<import("../src/providers/gist.ts").GistLoadOptions>,
): Promise<{
  gist: typeof import("../src/providers/gist.ts")
  api: FakeGist
}> {
  const gist = await import("../src/providers/gist.ts")
  const api = fakeGist()
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  ;(globalThis as any).gist = api
  const loadPromise = gist.load({ appId: "app_xyz", ...options })
  await new Promise((r) => setTimeout(r, 0))
  const script = document.getElementById("ahize-gist") as HTMLScriptElement
  expect(script).toBeTruthy()
  script.dispatchEvent(new Event("load"))
  await new Promise((r) => setTimeout(r, 60)) // let polling find the global
  document.dispatchEvent(new CustomEvent("gistReady"))
  await loadPromise
  return { gist, api }
}

describe("gist (browser) — vendor-doc audit fixes (#83)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).gist
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).gistAppId
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).gistSettings
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("track() prefers gist.trackEvent over gist.track", async () => {
    const { gist, api } = await bootGist()
    api.log.length = 0
    await gist.track("plan_upgraded", { tier: "pro" })
    const names = api.log.map((c) => c.name)
    expect(names).toContain("trackEvent")
    expect(names).not.toContain("track")
    await gist.destroy()
  })

  it("pageView() forwards to gist.trackPageView()", async () => {
    const { gist, api } = await bootGist()
    api.log.length = 0
    await gist.pageView({ path: "/home" })
    expect(api.log.map((c) => c.name)).toContain("trackPageView")
    await gist.destroy()
  })

  it("show()/open()/close()/hide() are now distinct", async () => {
    const { gist, api } = await bootGist()
    api.log.length = 0
    await gist.show()
    await gist.open()
    await gist.hide()
    await gist.close()
    const chatActions = api.log.filter((c) => c.name === "chat").map((c) => c.args[0])
    expect(chatActions).toEqual(["show", "open", "hide", "close"])
    await gist.destroy()
  })

  it("showLauncher/hideLauncher/setSidebar/setStandard/navigate/showArticle/trigger forward", async () => {
    const { gist, api } = await bootGist()
    api.log.length = 0
    await gist.showLauncher()
    await gist.hideLauncher()
    await gist.setSidebar()
    await gist.setStandard()
    await gist.navigate("articles")
    await gist.showArticle("art_1")
    await gist.trigger("survey", "s_1")
    const chatActions = api.log.filter((c) => c.name === "chat").map((c) => c.args)
    expect(chatActions).toContainEqual(["showLauncher"])
    expect(chatActions).toContainEqual(["hideLauncher"])
    expect(chatActions).toContainEqual(["sidebar"])
    expect(chatActions).toContainEqual(["standard"])
    expect(chatActions).toContainEqual(["navigate", "articles"])
    expect(chatActions).toContainEqual(["article", "art_1"])
    expect(api.log.find((c) => c.name === "trigger")?.args).toEqual(["survey", "s_1"])
    await gist.destroy()
  })

  it("shutdown() now calls gist.chat('shutdown') instead of gist.shutdown()", async () => {
    const { gist, api } = await bootGist()
    api.log.length = 0
    await gist.shutdown()
    expect(api.log.find((c) => c.name === "chat")?.args).toEqual(["shutdown"])
    expect(api.log.find((c) => c.name === "shutdown")).toBeUndefined()
    await gist.destroy()
  })

  it("hide_default_launcher / custom_launcher_selector populate gistSettings", async () => {
    const { gist } = await bootGist({
      hide_default_launcher: true,
      custom_launcher_selector: "#chat-button",
    })
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const settings = (globalThis as any).gistSettings as Record<string, unknown>
    expect(settings).toMatchObject({
      hide_default_launcher: true,
      custom_launcher_selector: "#chat-button",
    })
    await gist.destroy()
  })

  it("on('ready') fires when document gistReady event dispatches", async () => {
    let readyCount = 0
    const gist = await import("../src/providers/gist.ts")
    gist.on("ready", () => {
      readyCount++
    })
    // biome-ignore lint/suspicious/noExplicitAny: test shim
    ;(globalThis as any).gist = fakeGist()
    const loadPromise = gist.load({ appId: "app_xyz" })
    await new Promise((r) => setTimeout(r, 0))
    const script = document.getElementById("ahize-gist") as HTMLScriptElement
    script.dispatchEvent(new Event("load"))
    await new Promise((r) => setTimeout(r, 60))
    document.dispatchEvent(new CustomEvent("gistReady"))
    await loadPromise
    expect(readyCount).toBe(1)
    await gist.destroy()
  })
})
