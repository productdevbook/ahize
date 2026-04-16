/** A queued operation receives the real API once it becomes available. */
export type QueueOp<T> = (api: T) => void

/** Buffered call queue — drains in FIFO order once `ready()` is called. */
export interface Queue<T> {
  enqueue(op: QueueOp<T>): Promise<void>
  ready(api: T): void
  reset(): void
  isReady(): boolean
}

/** Build a fresh queue. Each provider keeps its own instance to buffer
 *  pre-boot calls until the real SDK attaches. */
export function createQueue<T>(): Queue<T> {
  const ops: Array<{ op: QueueOp<T>; resolve: () => void; reject: (e: unknown) => void }> = []
  let api: T | undefined
  let ready = false

  function drain(): void {
    while (ops.length > 0) {
      const entry = ops.shift()
      if (!entry || !api) return
      try {
        entry.op(api)
        entry.resolve()
      } catch (error) {
        entry.reject(error)
      }
    }
  }

  return {
    enqueue(op) {
      return new Promise((resolve, reject) => {
        ops.push({ op, resolve, reject })
        if (ready && api) drain()
      })
    },
    ready(realApi) {
      api = realApi
      ready = true
      drain()
    },
    reset() {
      api = undefined
      ready = false
      ops.length = 0
    },
    isReady() {
      return ready
    },
  }
}
