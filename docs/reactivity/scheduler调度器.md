# Scheduler 调度器

## 概述

Scheduler（调度器）是 Vue 响应式系统中的重要组成部分，负责**批量处理**和**异步调度**副作用函数的执行。它的核心作用是优化性能，避免不必要的重复执行。

## 为什么需要 Scheduler？

### 问题场景

假设我们有以下代码：

```javascript
const state = reactive({ count: 0 });

watch(
  () => state.count,
  (newVal) => {
    console.log('count changed:', newVal);
  }
);

// 连续修改多次
state.count = 1;
state.count = 2;
state.count = 3;
```

**如果没有 Scheduler**：

- 每次 `state.count` 变化都会立即同步执行回调
- 回调会执行 3 次：输出 1、2、3

**有了 Scheduler 之后**：

- 所有变化被收集到队列中
- 在微任务阶段一次性处理
- 回调只执行 1 次：输出最终值 3

## 核心概念

### 1. 微任务队列

Scheduler 利用 JavaScript 的**微任务（Microtask）** 机制实现异步批量处理：

```typescript
const resolvePromise = Promise.resolve();

function queueFlush() {
  if (!isFlushPending) {
    isFlushPending = true;
    currentFlushPromise = resolvePromise.then(flushJobs);
  }
}
```

- `Promise.resolve().then()` 会在当前同步代码执行完毕后，在微任务阶段执行
- 这确保了所有同步的数据变更都被收集后，再统一处理

### 2. 去重机制

```typescript
function flushPreFlushCbs() {
  if (pendingPreFlushCbs.length) {
    // 使用 Set 去重，避免同一个回调被多次执行
    const cbs = [...new Set(pendingPreFlushCbs)];
    pendingPreFlushCbs.length = 0;
    for (let i = 0; i < cbs.length; i++) {
      cbs[i]();
    }
  }
}
```

通过 `Set` 数据结构对回调进行去重，确保同一个 watcher 的回调在一个刷新周期内只执行一次。

### 3. 标志位控制

```typescript
let isFlushPending = false;
```

`isFlushPending` 标志位确保在一个刷新周期内，即使多次调用 `queueFlush()`，也只会创建一个微任务。

## 执行流程

```
┌─────────────────────────────────────────────────────────────┐
│                      同步代码执行阶段                          │
├─────────────────────────────────────────────────────────────┤
│  state.count = 1                                            │
│    └── trigger() → scheduler() → queuePreFlushCb(job)       │
│          └── queueCb() → queueFlush()                       │
│                └── isFlushPending = true                    │
│                └── Promise.resolve().then(flushJobs)        │
│                                                             │
│  state.count = 2                                            │
│    └── trigger() → scheduler() → queuePreFlushCb(job)       │
│          └── queueCb() → queueFlush()                       │
│                └── isFlushPending 已为 true，跳过            │
│                                                             │
│  state.count = 3                                            │
│    └── trigger() → scheduler() → queuePreFlushCb(job)       │
│          └── queueCb() → queueFlush()                       │
│                └── isFlushPending 已为 true，跳过            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      微任务执行阶段                           │
├─────────────────────────────────────────────────────────────┤
│  flushJobs()                                                │
│    └── isFlushPending = false                               │
│    └── flushPreFlushCbs()                                   │
│          └── 去重：[job, job, job] → [job]                  │
│          └── 执行 job()                                     │
│                └── effect.run() 获取最新值 (3)              │
│                └── 调用 callback(3, 0)                      │
└─────────────────────────────────────────────────────────────┘
```

## 与 Watch 的配合

在 `apiWatch.ts` 中，scheduler 被用于延迟执行 watch 的回调：

```typescript
const job = () => {
  if (cb) {
    const newValue = effect.run();
    if (deep || hasChanged(newValue, oldValue)) {
      cb(newValue, oldValue);
      oldValue = newValue;
    }
  }
};

// 通过 scheduler 将 job 放入异步队列
const scheduler = () => queuePreFlushCb(job);

// 创建 effect 时传入 scheduler
const effect = new ReactiveEffect(getter, scheduler);
```

**执行流程**：

1. 当监听的数据变化时，`trigger()` 被调用
2. `trigger()` 执行 `effect.scheduler()`（而不是 `effect.run()`）
3. `scheduler()` 调用 `queuePreFlushCb(job)` 将 job 加入队列
4. 当前同步代码执行完毕后，微任务阶段执行 `flushJobs()`
5. `job()` 被执行，获取最新值并调用用户回调

## 关键函数说明

| 函数                      | 作用                                        |
| ------------------------- | ------------------------------------------- |
| `queuePreFlushCb(cb)`     | 将回调加入 Pre-Flush 队列（DOM 更新前执行） |
| `queueCb(cb, pendingCbs)` | 将回调加入指定队列并触发刷新                |
| `queueFlush()`            | 调度一次刷新任务（微任务）                  |
| `flushJobs()`             | 执行刷新任务的入口                          |
| `flushPreFlushCbs()`      | 执行所有 Pre-Flush 回调                     |

## 状态变量说明

| 变量                  | 类型                    | 作用                        |
| --------------------- | ----------------------- | --------------------------- |
| `isFlushPending`      | `boolean`               | 是否已经调度了一次刷新      |
| `currentFlushPromise` | `Promise<void> \| null` | 当前刷新任务的 Promise      |
| `pendingPreFlushCbs`  | `Array<() => void>`     | 待执行的 Pre-Flush 回调队列 |

## 总结

Scheduler 通过以下机制优化了响应式系统的性能：

1. **异步批量处理**：利用微任务将多次数据变更合并为一次处理
2. **去重优化**：避免同一个 watcher 在一个刷新周期内重复执行
3. **执行顺序控制**：确保 Pre-Flush 回调在 DOM 更新之前执行

这使得 Vue 的响应式系统既能保持数据与视图的同步，又能避免不必要的性能开销。
