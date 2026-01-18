let isFlushPending = false;

const resolvePromise = Promise.resolve();

// 当前正在执行的刷新任务的 Promise
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let currentFlushPromise: Promise<void> | null = null;

const pendingPreFlushCbs: Array<() => void> = [];

export function queuePreFlushCb(cb: () => void) {
  queueCb(cb, pendingPreFlushCbs);
}

function queueCb(cb: () => void, pendingCbs: Array<() => void>) {
  pendingCbs.push(cb);
  queueFlush();
}

function queueFlush() {
  if (!isFlushPending) {
    isFlushPending = true;
    currentFlushPromise = resolvePromise.then(flushJobs);
  }
}

function flushJobs() {
  isFlushPending = false;

  flushPreFlushCbs();
}

function flushPreFlushCbs() {
  if (pendingPreFlushCbs.length) {
    const cbs = [...new Set(pendingPreFlushCbs)];
    pendingPreFlushCbs.length = 0;
    for (let i = 0; i < cbs.length; i++) {
      cbs[i]();
    }
  }
}
