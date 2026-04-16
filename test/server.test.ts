import { describe, expect, it } from "vitest"
import * as server from "../src/server.ts"

describe("ahize/server", () => {
  it("exposes the full client surface as no-ops", async () => {
    await expect(server.load()).resolves.toBeUndefined()
    await expect(server.identify({ id: "u" })).resolves.toBeUndefined()
    await expect(server.track("evt")).resolves.toBeUndefined()
    await expect(server.show()).resolves.toBeUndefined()
    await expect(server.hide()).resolves.toBeUndefined()
    await expect(server.shutdown()).resolves.toBeUndefined()
    await expect(server.destroy()).resolves.toBeUndefined()
  })

  it("reports anonymous identity and idle state", () => {
    expect(server.getIdentity()).toEqual({ kind: "anonymous" })
    expect(server.isReady()).toBe(false)
    expect(server.state()).toBe("idle")
  })

  it("onIdentityChange returns a safe unsubscribe", () => {
    const off = server.onIdentityChange(() => {})
    expect(typeof off).toBe("function")
    off()
  })
})
