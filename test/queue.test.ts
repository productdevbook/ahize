import { describe, expect, it } from "vitest"
import { createQueue } from "../src/_queue.ts"

describe("createQueue", () => {
  it("drains in enqueue order after ready()", async () => {
    const queue = createQueue<{ calls: string[] }>()
    const api = { calls: [] as string[] }

    const p1 = queue.enqueue((a) => a.calls.push("a"))
    const p2 = queue.enqueue((a) => a.calls.push("b"))
    const p3 = queue.enqueue((a) => a.calls.push("c"))

    expect(api.calls).toEqual([])
    expect(queue.isReady()).toBe(false)

    queue.ready(api)
    await Promise.all([p1, p2, p3])

    expect(api.calls).toEqual(["a", "b", "c"])
    expect(queue.isReady()).toBe(true)
  })

  it("runs synchronously when already ready", async () => {
    const queue = createQueue<number[]>()
    const out: number[] = []
    queue.ready(out)
    await queue.enqueue((a) => a.push(1))
    await queue.enqueue((a) => a.push(2))
    expect(out).toEqual([1, 2])
  })

  it("rejects the enqueue promise when op throws", async () => {
    const queue = createQueue<object>()
    queue.ready({})
    await expect(
      queue.enqueue(() => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
  })

  it("reset() clears state and pending ops", () => {
    const queue = createQueue<object>()
    queue.enqueue(() => {})
    queue.ready({})
    queue.reset()
    expect(queue.isReady()).toBe(false)
  })

  it("preserves order when enqueues happen mid-drain", async () => {
    const queue = createQueue<string[]>()
    const out: string[] = []
    const p1 = queue.enqueue((a) => {
      a.push("1")
      queue.enqueue((b) => b.push("1.1"))
    })
    const p2 = queue.enqueue((a) => a.push("2"))
    queue.ready(out)
    await Promise.all([p1, p2])
    await new Promise((r) => setTimeout(r, 0))
    expect(out).toEqual(["1", "2", "1.1"])
  })
})
