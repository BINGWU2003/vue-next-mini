# Vue 3 原理笔记：为什么 Watch 支持异步而 Computed 不支持？

## 核心结论

| 特性       | Computed (计算属性)           | Watch (侦听器)                   |
| ---------- | ----------------------------- | -------------------------------- |
| **本质**   | **数据的映射** (Data Mapping) | **副作用的触发器** (Side Effect) |
| **关注点** | 关注 **结果** (Return Value)  | 关注 **过程** (Execution)        |
| **同步性** | **必须同步**                  | **允许异步**                     |
| **返回值** | 必须返回一个值供模板渲染      | 不需要返回值 (Void)              |
| **缓存**   | 有 (`_dirty` 机制)            | 无                               |
| **类比**   | Excel 公式 (`=A1+A2`)         | 订外卖 (下单 -> 等待 -> 送达)    |

---

## 一、设计初衷的差异

### 1. Computed：为了“产出数据”

- **定义**：计算属性是对现有响应式数据的加工。它被视为一种“衍生状态”。
- **场景**：模板中直接使用 `{{ computedValue }}`。
- **同步约束**：当模板渲染到这个变量时，Vue 需要**立即**拿到一个确切的值（字符串、数字、对象等）来生成 DOM。如果计算属性是异步的，它返回的是一个 `Promise` 对象，模板引擎无法直接渲染 Promise，页面会显示错误或 `[object Promise]`。

### 2. Watch：为了“执行过程”

- **定义**：侦听器是当数据变化时执行的一段逻辑回调。
- **场景**：API 请求、DOM 操作、打印日志、复杂的业务流转。
- **异步宽容**：Vue 的调度器只负责**触发**这个回调函数。至于回调函数内部是同步执行完，还是 `await` 等待 3 秒，Vue 并不关心，也不需要在这个回调中获取返回值。

---

## 二、底层原理机制分析 (源码视角)

### 1. Computed 的死穴：返回值与依赖收集

在源码的 `ComputedRefImpl` 中，值的计算逻辑大致如下：

```typescript
// 伪代码
get value() {
  if (this._dirty) {
    // 🛑 限制一：这里必须同步拿到结果赋值给 _value
    this._value = this.effect.run();
    this._dirty = false;
  }
  return this._value;
}

```

如果用户的 getter 是异步的 (`async () => ...`)：

1. **返回值异常**：`this.effect.run()` 返回的是 `Promise`，导致 `_value` 变成 Promise，破坏了数据类型。
2. **脏值检查失效**：Promise 会立即返回，`_dirty` 瞬间变回 `false`，但真实数据还没回来。
3. **🔴 依赖收集丢失 (关键)**：

- Vue 的依赖收集依赖于全局变量 `activeEffect`。
- 流程：`start -> activeEffect = current -> run() -> track -> activeEffect = undefined`。
- 如果是异步：`await` 之后的代码会被放入微任务队列。当它们执行时，同步的 `activeEffect` 早已复位。导致 `await` 之后读取的响应式数据**无法被追踪**，计算属性将失去响应性。

### 2. Watch 的自由：调度与回调

Watch 的执行机制大致如下：

```typescript
const job = () => {
  if (cb) {
    // 🟢 自由：Vue 只负责执行 cb，不关心 cb 内部干了什么，也不接收返回值
    cb(newValue, oldValue, onCleanup);
  }
};
```

- **依赖收集前置**：Watch 的依赖收集是在 `getter` 阶段（或 `traverse` 阶段）完成的，这个阶段是同步的。
- **回调后置**：当依赖触发 `job` 时，Vue 只是把 `cb` 扔出去执行。`cb` 内部无论是同步还是异步，都不影响 Vue 的响应式系统运行。

---

## 三、代码对比与最佳实践

### ❌ 错误示范：在 Computed 中写异步

```javascript
// 这行不通！
const userInfo = computed(async () => {
  // 1. 返回的是 Promise，模板没法显示
  // 2. await 之后的依赖（如果有）收集不到
  const res = await fetch(`/api/user/${userId.value}`);
  return await res.json();
});
```

### ✅ 正确示范：在 Watch 中写异步

```javascript
const userInfo = ref(null); // 1. 需要一个中间状态来承载结果

watch(
  userId,
  async (newId) => {
    userInfo.value = null; // 重置状态
    // 2. 执行异步逻辑
    const res = await fetch(`/api/user/${newId}`);
    // 3. 异步结束后，手动修改响应式数据
    userInfo.value = await res.json();
  },
  { immediate: true }
);
```

### 💡 模式总结：异步计算

在 Vue 中，所谓的“异步计算属性”其实就是：

> **响应式状态 (Ref) + 侦听器 (Watch)**

_(注：`VueUse` 库提供的 `computedAsync` 本质上也是对这一模式的封装)_

---

## 四、通俗类比

- **Computed 是 Excel 公式**：
- `A3 = A1 + A2`。
- 你改变 A1，A3 必须**立刻**变。如果 A3 显示“正在计算...”，Excel 就没法工作了。

- **Watch 是 订外卖**：
- 你告诉外卖员（Watch）：“门铃响了（依赖变了）就去帮我买饭（异步操作）”。
- 你可以继续看电视（渲染页面），不需要等他立刻回来。
- 他买回来后，把饭放在桌子上（修改 Ref）即可。
