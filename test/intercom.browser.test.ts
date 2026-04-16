// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

describe("intercom (browser)", () => {
  beforeEach(() => {
    vi.resetModules()
    // biome-ignore lint/suspicious/noExplicitAny: test shim
    delete (globalThis as any).Intercom
    // biome-ignore lint/suspicious/noExplicitAny: test shim
    delete (globalThis as any).intercomSettings
    const scripts = document.querySelectorAll("script")
    for (let i = 0; i < scripts.length; i++) {
      ;(scripts[i] as { remove(): void } | undefined)?.remove()
    }
  })

  it("queues calls made before load() resolves", async () => {
    const intercom = await import("../src/providers/intercom.ts")

    const loadPromise = intercom.load({ appId: "app_xyz" })

    const identifyPromise = intercom.identify({ id: "u1", email: "a@b" })
    const trackPromise = intercom.track("plan_upgraded", { tier: "pro" })
    const showPromise = intercom.show()

    // Let load() reach the injectScript() call.
    await new Promise((r) => setTimeout(r, 0))

    // Simulate Intercom's real CDN replacing the stub with a spy fn.
    const script = document.getElementById("ahize-intercom") as HTMLScriptElement
    expect(script).toBeTruthy()
    const calls: unknown[][] = []
    const real = (...args: unknown[]) => calls.push(args)
    // biome-ignore lint/suspicious/noExplicitAny: test shim
    ;(globalThis as any).Intercom = real
    script.dispatchEvent(new Event("load"))

    await loadPromise
    await Promise.all([identifyPromise, trackPromise, showPromise])

    const commands = calls.map((c) => c[0])
    expect(commands).toContain("update")
    expect(commands).toContain("trackEvent")
    expect(commands).toContain("show")
  })

  it("onIdentityChange fires on identify()", async () => {
    const intercom = await import("../src/providers/intercom.ts")
    const listener = vi.fn()
    intercom.onIdentityChange(listener)

    const loadPromise = intercom.load({ appId: "app_xyz" })
    const identifyPromise = intercom.identify({ id: "u1" })

    await new Promise((r) => setTimeout(r, 0))

    // biome-ignore lint/suspicious/noExplicitAny: test shim
    ;(globalThis as any).Intercom = () => {}
    const script = document.getElementById("ahize-intercom") as HTMLScriptElement
    script.dispatchEvent(new Event("load"))
    await loadPromise
    await identifyPromise

    expect(listener).toHaveBeenCalled()
    expect(intercom.getIdentity()).toMatchObject({
      kind: "identified",
      identity: { id: "u1" },
    })
  })

  it("consent: false makes load() a no-op (no script injected)", async () => {
    const intercom = await import("../src/providers/intercom.ts")
    await intercom.load({ appId: "app_xyz", consent: false })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById("ahize-intercom")).toBeNull()
    expect(intercom.state()).toBe("idle")
  })

  it("defer: manual never resolves load() by itself", async () => {
    const intercom = await import("../src/providers/intercom.ts")
    let resolved = false
    intercom.load({ appId: "app_xyz", defer: "manual" }).then(() => {
      resolved = true
    })
    await new Promise((r) => setTimeout(r, 80))
    expect(resolved).toBe(false)
  })

  it("rejects callback verification (only HMAC/JWT supported)", async () => {
    const intercom = await import("../src/providers/intercom.ts")
    intercom.load({ appId: "app_xyz" })
    await expect(
      intercom.identify({
        id: "u1",
        verification: { kind: "callback", getToken: async () => "x" },
      }),
    ).rejects.toThrow(/HMAC.*JWT/)
  })
})
