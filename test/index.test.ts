import { describe, expect, it } from "vitest"
import { version, isBrowser, AhizeError } from "../src/index.ts"

describe("ahize", () => {
  it("exposes a version string", () => {
    expect(typeof version).toBe("string")
    expect(version.length).toBeGreaterThan(0)
  })

  it("detects non-browser runtime", () => {
    expect(isBrowser()).toBe(false)
  })

  it("exports AhizeError", () => {
    const err = new AhizeError("boom")
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("AhizeError")
  })
})
