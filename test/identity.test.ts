import { describe, expect, it, vi } from "vitest"
import { createIdentityStore } from "../src/_identity.ts"

describe("createIdentityStore", () => {
  it("starts anonymous", () => {
    const store = createIdentityStore()
    expect(store.get()).toEqual({ kind: "anonymous" })
  })

  it("transitions anonymous → identified → anonymous", () => {
    const store = createIdentityStore()
    const listener = vi.fn()
    store.onChange(listener)

    store.identify({ id: "u1", email: "a@b" })
    expect(store.get()).toEqual({
      kind: "identified",
      identity: { id: "u1", email: "a@b" },
    })

    store.reset()
    expect(store.get()).toEqual({ kind: "anonymous" })

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(
      1,
      { kind: "identified", identity: { id: "u1", email: "a@b" } },
      { kind: "anonymous" },
    )
    expect(listener).toHaveBeenNthCalledWith(
      2,
      { kind: "anonymous" },
      { kind: "identified", identity: { id: "u1", email: "a@b" } },
    )
  })

  it("fires listener on identified → identified (user switch)", () => {
    const store = createIdentityStore()
    store.identify({ id: "u1" })
    const listener = vi.fn()
    store.onChange(listener)
    store.identify({ id: "u2" })
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0]?.[0]).toEqual({
      kind: "identified",
      identity: { id: "u2" },
    })
  })

  it("onChange returns an unsubscribe function", () => {
    const store = createIdentityStore()
    const listener = vi.fn()
    const off = store.onChange(listener)
    off()
    store.identify({ id: "u1" })
    expect(listener).not.toHaveBeenCalled()
  })
})
