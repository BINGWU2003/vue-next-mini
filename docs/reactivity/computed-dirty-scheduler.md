# Vue 3 源码笔记：Computed 的 `_dirty` 机制与 Effect 调度策略

## 一、核心标志位：`_dirty`

`_dirty` 是 `ComputedRefImpl` 中的一个布尔值，它是 Computed 实现**懒执行（Lazy Evaluation）和性能优化**的关键。

### 1. 双重职责

- **缓存控制 (Caching & Lazy)**
- **`false` (Clean):** 表示当前缓存的值（`_value`）是新鲜的。当外部访问 `computed.value` 时，直接返回缓存值，**不执行 getter**。
- **`true` (Dirty):** 表示依赖发生了变化，缓存已失效。当外部访问时，必须调用 `this.effect.run()` 重新计算新值，并将 `_dirty` 重置为 `false`。

- **触发节流 (Notification Throttling)**
- 防止因依赖多次修改而导致下游（如组件）多次更新。
- **机制：** 当依赖发生变化触发 `scheduler` 时，会有如下判断：

```typescript
// 伪代码逻辑
if (!this._dirty) {
  this._dirty = true;
  triggerRefValue(this); // 只有第一次变脏时，才通知下游
}
```

- **效果：** 无论依赖被修改多少次，只要没有读取重置，Computed 只会向外发送**一次**更新通知。

---

## 二、源码解析：调度策略 (`triggerEffects`)

Vue 3 在触发依赖更新时，对不同类型的 Effect 有明确的优先级控制，这是保证**数据一致性**和**防止重复渲染**的核心。

### 1. 关键源码

```typescript
export function triggerEffect(effect: ReactiveEffect) {
  // 1. 优先执行 scheduler（如果存在）
  if (effect.scheduler) {
    effect.scheduler();
  } else {
    effect.run();
  }
}

export function triggerEffects(dep: Dep) {
  // 2. 第一轮：优先触发 Computed 类型的 Effect
  dep.forEach((effect) => {
    if (effect.computed) {
      triggerEffect(effect);
    }
  });

  // 3. 第二轮：后触发非 Computed Effect（如组件渲染、Watch）
  dep.forEach((effect) => {
    if (!effect.computed) {
      triggerEffect(effect);
    }
  });
}
```

### 2. 深度解析

#### Q1: 为什么 `triggerEffect` 要优先执行 `scheduler`？

- **夺取控制权**：`scheduler` 允许将“依赖变化”和“实际执行”解耦。
- **Computed 的场景**：它的 `scheduler` 逻辑仅仅是 `_dirty = true`（标记脏状态），而不是立即计算。如果不走 scheduler 直接 run，就会变成同步计算，丢失“懒执行”特性。
- **组件的场景**：它的 `scheduler` 是将更新任务推入微任务队列（`queueJob`），实现批量异步更新。

#### Q2: 为什么 `triggerEffects` 要先触发 `computed`？

这是为了防止 **“脏读” (Stale Read)** 和 **“双重渲染” (Double Render)**。

- **如果顺序反了（先 Render 后 Computed）：**

1. 依赖变了 -> 组件先渲染。
2. 组件读取 Computed -> 此时 Computed 还没执行 Effect，可能还不知道自己脏了（或者缓存没更新）-> **组件读到旧值**。
3. Computed 稍后执行 -> 发现自己变了 -> 通知组件。
4. 组件被迫**再次渲染**。

- **结果：** 页面闪烁，性能浪费。

- **正确顺序（先 Computed 后 Render）：**

1. 依赖变了 -> Computed 先执行 scheduler -> **标记 `\_dirty = true**`。
2. 组件后执行 -> 组件渲染。
3. 组件读取 Computed -> Computed 发现自己是 dirty -> **立即重算新值**。
4. 组件拿到最新值完成渲染。

- **结果：** 一次渲染，数据精准同步。

---

## 三、执行闭环与死循环规避

在 Render Effect 读取 Computed 的过程中，形成了一个看似危险的闭环，但实际上是非常安全的：

`Render Effect` ➔ `读取 computed.value` ➔ `触发 get` ➔ `重新计算 (run)` ➔ `_dirty = false` ➔ `返回新值` ➔ `Render Effect 继续`

- **为什么不会死循环？**
- 这个闭环是 **读操作 (Read)** 驱动的。
- 重新计算的过程只是**读取**依赖，并将 `_dirty` 翻转为 `false`。
- 只要 Computed 的 getter 函数内部没有副作用（即不去**修改**响应式数据），就不会再次触发 `trigger`，流程在 Render 结束后自然静止。

---

## 四、总结

Vue 3 的响应式系统通过精妙的标志位设计和调度优先级，实现了以下平衡：

1. **懒惰 (Laziness):** 不读不算（通过 `_dirty`）。
2. **节流 (Throttling):** 多改只通一次（通过 `_dirty` 判断）。
3. **一致性 (Consistency):** 先标脏，后渲染（通过 `triggerEffects` 排序）。
