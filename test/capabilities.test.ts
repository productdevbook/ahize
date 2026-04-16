import { describe, expect, it } from "vitest"
import { capabilities, supports } from "../src/capabilities.ts"

describe("capabilities", () => {
  it("intercom supports HMAC and JWT", () => {
    const caps = capabilities("intercom")
    expect(caps.hmac).toBe(true)
    expect(caps.jwt).toBe(true)
    expect(caps.callback).toBe(false)
    expect(caps.regions).toBe(true)
  })

  it("zendesk uses jwt + callback (no hmac)", () => {
    const caps = capabilities("zendesk")
    expect(caps.hmac).toBe(false)
    expect(caps.jwt).toBe(true)
    expect(caps.callback).toBe(true)
  })

  it("chatwoot is the self-hosted one", () => {
    expect(supports("chatwoot", "selfHosted")).toBe(true)
    expect(supports("intercom", "selfHosted")).toBe(false)
  })

  it("sendbird and jivochat have no native track", () => {
    expect(supports("sendbird", "trackEvents")).toBe(false)
    expect(supports("jivochat", "trackEvents")).toBe(false)
  })
})
