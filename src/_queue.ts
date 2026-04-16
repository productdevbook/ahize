export type QueueOp<T> = (api: T) => void;

export interface Queue<T> {
  enqueue(op: QueueOp<T>): Promise<void>;
  ready(api: T): void;
  reset(): void;
  isReady(): boolean;
}

export function createQueue<T>(): Queue<T> {
  const ops: Array<{ op: QueueOp<T>; resolve: () => void; reject: (e: unknown) => void }> = [];
  let api: T | undefined;
  let ready = false;

  function drain(): void {
    while (ops.length > 0) {
      const entry = ops.shift();
      if (!entry || !api) return;
      try {
        entry.op(api);
        entry.resolve();
      } catch (error) {
        entry.reject(error);
      }
    }
  }

  return {
    enqueue(op) {
      return new Promise((resolve, reject) => {
        ops.push({ op, resolve, reject });
        if (ready && api) drain();
      });
    },
    ready(realApi) {
      api = realApi;
      ready = true;
      drain();
    },
    reset() {
      api = undefined;
      ready = false;
      ops.length = 0;
    },
    isReady() {
      return ready;
    },
  };
}
