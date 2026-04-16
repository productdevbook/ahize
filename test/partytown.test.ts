import { describe, expect, it } from "vitest"
import { partytownConfig, partytownForward } from "../src/adapters/partytown.ts"

describe("partytownForward", () => {
  it("returns Intercom globals", () => {
    expect(partytownForward("intercom")).toContain("Intercom")
    expect(partytownForward("intercom")).toContain("intercomSettings")
  })

  it("merges multiple providers without dupes", () => {
    const out = partytownForward("intercom", "intercom", "crisp")
    const intercomCount = out.filter((k) => k === "Intercom").length
    expect(intercomCount).toBe(1)
    expect(out).toContain("$crisp")
  })

  it("partytownConfig wraps the array", () => {
    const cfg = partytownConfig("tawk")
    expect(cfg.forward).toContain("Tawk_API")
    expect(cfg.forward).toContain("Tawk_LoadStart")
  })
})
