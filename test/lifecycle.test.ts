import { describe, expect, it, vi } from "vitest"
import { createLifecycle, hashConfig } from "../src/_lifecycle.ts"

describe("createLifecycle", () => {
  it("starts idle and emits on transition", () => {
    const lc = createLifecycle()
    const listener = vi.fn()
    lc.onChange(listener)

    lc.transition("loading")
    lc.transition("ready")

    expect(lc.state()).toBe("ready")
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, "loading", "idle")
    expect(listener).toHaveBeenNthCalledWith(2, "ready", "loading")
  })

  it("skips no-op transitions", () => {
    const lc = createLifecycle()
    const listener = vi.fn()
    lc.onChange(listener)
    lc.transition("idle")
    expect(listener).not.toHaveBeenCalled()
  })

  it("tracks configHash", () => {
    const lc = createLifecycle()
    lc.setConfigHash("a=1")
    expect(lc.configHash()).toBe("a=1")
    lc.clearConfigHash()
    expect(lc.configHash()).toBeUndefined()
  })
})

describe("hashConfig", () => {
  it("is deterministic regardless of key order", () => {
    expect(hashConfig({ b: 2, a: 1 })).toBe(hashConfig({ a: 1, b: 2 }))
  })

  it("differs when a value differs", () => {
    expect(hashConfig({ a: 1 })).not.toBe(hashConfig({ a: 2 }))
  })

  it("ignores undefined/null", () => {
    expect(hashConfig({ a: 1, b: undefined })).toBe(hashConfig({ a: 1 }))
  })
})
