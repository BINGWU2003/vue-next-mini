# Vue 3 源码笔记：Computed 的 `_dirty` 机制详解

## 核心概念

`_dirty` 是 `ComputedRefImpl` 类中的一个布尔值标志位。它是 Vue 计算属性实现 **懒执行 (Lazy Evaluation)** 和 **性能优化** 的灵魂。

- **`true` (脏)**：代表依赖变了，数据可能过时了，下次读取必须重算。
- **`false` (净)**：代表依赖没变，数据是新鲜的，直接返回缓存。

---

## 一、缓存机制：防止重复计算

**场景**：当依赖数据未发生变化时，无论访问多少次计算属性，都不会重新执行 Getter 函数，而是直接返回上一次计算的结果（`_value`）。

### 1.1 源码逻辑解析 (Source Code)

在 `ComputedRefImpl` 类的 `get value()` 方法中，Vue 通过判断 `_dirty` 来决定是“读取缓存”还是“重新计算”。

```typescript
// 伪代码：简化版 Vue 3 源码逻辑
class ComputedRefImpl {
  public _dirty = true;
  private _value;
  public effect;

  get value() {
    // 1. 收集依赖 (让引用者依赖这个 computed)
    trackRefValue(this);

    // 2. 缓存核心判断：如果是脏的，才重新计算
    if (this._dirty) {
      this._dirty = false; // ♻️ 标记为干净，下次直接走缓存
      this._value = this.effect.run(); // ⚡️ 执行真正的计算逻辑
    }

    // 3. 如果不是脏的(else)，直接返回上一次算好的 _value
    return this._value;
  }
}
```

### 1.2 实际运行代码演示 (Usage Example)

```javascript
const { reactive, computed } = Vue;

const state = reactive({ count: 1 });

const double = computed(() => {
  // 🔍 只有这行打印了，才代表真正消耗了 CPU 进行计算
  console.log('⚡️ [计算中] 执行了耗时的 Getter 函数');
  return state.count * 2;
});

console.log('--- 1. 首次读取 ---');
console.log(`结果: ${double.value}`);
// 👉 源码逻辑：_dirty 初始为 true -> 进入 if 分支 -> 执行 run() -> 打印日志
// 👉 控制台输出: 结果: 2
// 🟢 此时 _dirty 变为 false

console.log('--- 2. 连续读取 (缓存生效) ---');
console.log(`结果: ${double.value}`);
console.log(`结果: ${double.value}`);
// 👉 源码逻辑：_dirty 为 false -> 跳过 if 分支 -> 直接 return this._value
// ✅ 控制台无日志，这就是“缓存生效”

console.log('--- 3. 修改依赖 ---');
state.count = 5;
// 🔴 触发 Setter -> Scheduler -> 将 _dirty 再次置为 true

console.log('--- 4. 再次读取 ---');
console.log(`结果: ${double.value}`);
// 👉 源码逻辑：_dirty 为 true -> 进入 if 分支 -> 重新计算
// 👉 控制台输出: 结果: 10
```

---

## 二、调度优化：防止重复通知

**场景**：当我们在一次操作中连续多次修改依赖数据（`state.prop`）时，Computed 应当只通知外部（如组件或 Watcher）更新一次，而不是修改几次就通知几次。

### 2.1 源码逻辑解析 (Source Code)

在 Computed 的 `scheduler` 中，利用 `_dirty` 作为锁，防止重复触发更新。

```typescript
// 伪代码：简化版 Vue 3 源码逻辑
scheduler: () => {
  // 关键判断：只有当前是“干净”的时候，才需要去通知
  // 如果已经是 dirty (true) 了，说明已经通知过了，这次变更就不用再喊了
  if (!this._dirty) {
    this._dirty = true; // 1. 标记为脏
    triggerRefValue(this); // 2. 通知下游 (组件/Watcher)
  }
};
```

### 2.2 实际运行代码演示 (Usage Example)

假设有一个组件正在使用 `double` 计算属性。

```javascript
const { reactive, computed, effect } = Vue;

const state = reactive({ num: 10 });
const plusOne = computed(() => state.num + 1);

// 模拟一个组件或 Watcher 依赖这个计算属性
effect(() => {
  console.log(`📢 [通知] 下游接收到了更新，当前值: ${plusOne.value}`);
});
// 👉 输出: [通知] ... 11 (初始化执行一次)

console.log('--- 开始连续修改依赖 ---');

// 💡 动作：连续修改 3 次 state.num
// Vue 的响应式系统会同步触发 3 次 setter
state.num = 20;
state.num = 30;
state.num = 40;

console.log('--- 修改结束 ---');

/**
 * 🕵️‍♂️ 执行流程分析 (假设 effect 带有调度器)：
 * * 1. state.num = 20
 * -> 触发 scheduler -> 检查 if (!dirty) -> 是 false (干净)
 * -> 标记 dirty = true -> 📢 发送通知 (组件进入异步队列)
 *
 * * 2. state.num = 30
 * -> 触发 scheduler -> 检查 if (!dirty) -> ❌ 是 true (因为刚才标脏了且还没重算)
 * -> 🛑 直接 Return，不发送通知
 *
 * * 3. state.num = 40
 * -> 触发 scheduler -> 检查 if (!dirty) -> ❌ 是 true
 * -> 🛑 直接 Return，不发送通知
 *
 * * ✅ 最终结果：下游 effect 即使数据变了3次，也只收到了一次通知。
 */
```

### 2.3 深度辨析：调度器 (Scheduler) 的必要性

**特别注意**：Computed 的通知节流机制，必须配合 **异步调度** 才能生效。

如果在没有调度器的 **同步 Effect** 中测试，会出现“改一次、通知一次”的现象（节流失效）。原因对比如下：

| 模式 | 执行流程 (修改依赖时) | 结果 |
| ---- | --------------------- | ---- |

| **同步 Effect**<br>

<br>(无调度器) | 1. 变脏 (`true`)<br>

<br>2. 通知 Effect<br>

<br>3. **Effect 立即执行**，读取 Computed<br>

<br>4. Computed 重算，**变净 (`false`)**<br>

<br>5. 下次修改时，因为又是“净”的，所以**再次通知**。 | ❌ **节流失效**<br>

<br>改几次通知几次 |
| **异步 Effect**<br>

<br>(Vue组件/带Scheduler) | 1. 变脏 (`true`)<br>

<br>2. 通知 Effect<br>

<br>3. **Effect 进入队列等待 (不立即执行)**<br>

<br>4. `_dirty` **保持为 `true**`<br>

<br>5. 下次修改时，因为是“脏”的，**不再通知**。<br>

<br>6. 最终队列执行，读取 Computed，变净。 | ✅ **完美节流**<br>

<br>改多次只通知一次 |

> **结论**：Vue 组件渲染自带异步调度系统 (`queueJob`)，因此能完美配合 Computed 的 `_dirty` 锁机制实现性能优化。

---

## 三、总结

| 场景                 | `_dirty` 的状态 | 行为                              | 目的                  |
| -------------------- | --------------- | --------------------------------- | --------------------- |
| **读取 (Read)**      | `false`         | 直接返回 `_value` (跳过计算)      | **缓存 (Caching)**    |
| **读取 (Read)**      | `true`          | 执行 `effect.run()` 重算          | **懒执行 (Lazy)**     |
| **修改依赖 (Write)** | `false`         | 变 `true` 并触发 `trigger`        | **响应 (Reactivity)** |
| **修改依赖 (Write)** | `true`          | 维持 `true`，**不触发** `trigger` | **节流 (Throttling)** |
