# Watch 侦听器

## 概述

`watch` 是 Vue 响应式系统中的核心 API，用于**侦听**响应式数据的变化，并在数据变化时执行回调函数。与 `computed` 不同，`watch` 主要用于执行**副作用**（如异步请求、DOM 操作、日志记录等）。

## 基本用法

### 侦听 getter 函数

```javascript
const state = reactive({
  name: 'John',
  age: 18,
});

watch(
  () => state.age, // getter 函数
  (newVal, oldVal) => {
    console.log('watch age', newVal, oldVal);
  }
);

// 2秒后修改 age
setTimeout(() => {
  state.age = 100; // 触发回调：watch age 100 18
}, 2000);
```

### 侦听 reactive 对象

```javascript
const state = reactive({ count: 0 });

watch(
  state,
  (newVal, oldVal) => {
    console.log('state changed', newVal, oldVal);
  },
  { deep: true }
);
```

> **注意**：侦听 reactive 对象时，会自动启用 `deep: true`。

## API 签名

```typescript
function watch<T>(
  source: T, // 侦听源
  cb?: (newVal: T, oldVal: T) => void, // 回调函数
  options?: WatchOptions // 选项
): { stop: () => void };

type WatchOptions = {
  immediate?: boolean; // 是否立即执行回调
  deep?: boolean; // 是否深度侦听
};
```

## 支持的 source 类型

| Source 类型       | 示例                  | 说明                            |
| ----------------- | --------------------- | ------------------------------- |
| **Getter 函数**   | `() => state.age`     | ✅ 推荐方式，精确控制侦听的属性 |
| **Reactive 对象** | `state`               | 自动启用深度侦听                |
| **普通值**        | `state.age` (值为 18) | ⚠️ 无法响应式追踪，不建议使用   |

## 核心实现

### doWatch 函数流程

```
┌─────────────────────────────────────────────────────────────────┐
│                         doWatch(source, cb, options)            │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: 确定 getter 函数                                        │
├─────────────────────────────────────────────────────────────────┤
│  if (isReactive(source)) {                                      │
│    getter = () => source;                                       │
│    deep = true;              // 自动启用深度侦听                  │
│  } else if (isFunction(source)) {                               │
│    getter = source;          // 直接使用传入的 getter             │
│  } else {                                                       │
│    getter = () => source;    // 包装普通值（⚠️ 无响应式）          │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: 处理深度侦听                                            │
├─────────────────────────────────────────────────────────────────┤
│  if (cb && deep) {                                              │
│    const baseGetter = getter;                                   │
│    getter = () => traverse(baseGetter());                       │
│  }                                                              │
│                                                                 │
│  // traverse 递归遍历对象的每个属性，触发依赖收集                   │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: 定义 job 和 scheduler                                   │
├─────────────────────────────────────────────────────────────────┤
│  const job = () => {                                            │
│    const newValue = effect.run();                               │
│    if (deep || hasChanged(newValue, oldValue)) {                │
│      cb(newValue, oldValue);                                    │
│      oldValue = newValue;                                       │
│    }                                                            │
│  };                                                             │
│                                                                 │
│  const scheduler = () => queuePreFlushCb(job);                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: 创建 ReactiveEffect                                     │
├─────────────────────────────────────────────────────────────────┤
│  const effect = new ReactiveEffect(getter, scheduler);          │
│                                                                 │
│  // effect.fn = getter                                          │
│  // effect.scheduler = scheduler                                │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: 初始化执行                                              │
├─────────────────────────────────────────────────────────────────┤
│  if (cb) {                                                      │
│    if (immediate) {                                             │
│      job();                  // 立即执行回调                      │
│    } else {                                                     │
│      oldValue = effect.run(); // 只收集依赖，获取旧值              │
│    }                                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  return { stop() {} }        // 返回停止函数（待实现）             │
└─────────────────────────────────────────────────────────────────┘
```

## 执行流程详解

### 初始化阶段

以下面的代码为例：

```javascript
const state = reactive({ age: 18 });

watch(
  () => state.age,
  (newVal, oldVal) => {
    console.log('age changed', newVal, oldVal);
  }
);
```

**执行步骤**：

1. `watch()` 调用 `doWatch()`
2. `source` 是函数，所以 `getter = () => state.age`
3. 创建 `ReactiveEffect`，传入 `getter` 和 `scheduler`
4. 执行 `effect.run()`：
   - `activeEffect` 指向当前 effect
   - 执行 `getter()`，访问 `state.age`
   - 触发 `track()`，将 effect 收集到 `state.age` 的依赖集合中
   - 返回值 `18` 保存到 `oldValue`

```
┌─────────────────────────────────────────────────────────────────┐
│  初始化后的状态                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  targetMap:                                                     │
│    └── state                                                    │
│          └── "age" → dep: Set { effect }                        │
│                                                                 │
│  oldValue = 18                                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 触发阶段

当执行 `state.age = 100` 时：

```
┌─────────────────────────────────────────────────────────────────┐
│  state.age = 100                                                │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Proxy set 拦截器                                                │
│  └── trigger(state, "age")                                      │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  triggerEffects(dep)                                            │
│  └── effect.scheduler 存在                                       │
│  └── 调用 effect.scheduler()                                    │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  scheduler()                                                    │
│  └── queuePreFlushCb(job)                                       │
│  └── job 被加入异步队列                                          │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼ (微任务阶段)
┌─────────────────────────────────────────────────────────────────┐
│  flushJobs()                                                    │
│  └── flushPreFlushCbs()                                         │
│        └── job()                                                │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  job()                                                          │
│  ├── newValue = effect.run()  → 100                             │
│  ├── hasChanged(100, 18) → true                                 │
│  ├── cb(100, 18)  → 执行用户回调                                 │
│  └── oldValue = 100                                             │
└─────────────────────────────────────────────────────────────────┘
```

## 关键函数

### traverse - 深度遍历

```typescript
function traverse(value: any) {
  if (!isObject(value)) return value;
  const val = value as Record<string, any>;
  for (const key in val) {
    traverse(val[key]); // 递归访问每个属性
  }
  return value;
}
```

**作用**：递归访问对象的每个属性，触发所有属性的 getter，从而收集所有嵌套属性的依赖。

**使用场景**：当 `deep: true` 时，需要侦听对象内部任意属性的变化。

### job - 执行回调

```typescript
const job = () => {
  if (cb) {
    const newValue = effect.run(); // 重新执行 getter，获取最新值
    if (deep || hasChanged(newValue, oldValue)) {
      cb(newValue, oldValue); // 调用用户回调
      oldValue = newValue; // 更新旧值
    }
  }
};
```

**关键点**：

- 重新执行 `effect.run()` 获取最新值
- 通过 `hasChanged` 判断值是否真的变化（避免无意义的回调）
- 深度侦听时跳过变化检测（因为对象引用不变，但内部属性可能变了）

## 常见问题

### 为什么直接传递 `state.age` 无法响应变化？

```javascript
// ❌ 错误用法
watch(state.age, (newVal, oldVal) => { ... });

// ✅ 正确用法
watch(() => state.age, (newVal, oldVal) => { ... });
```

**原因**：`state.age` 在传递时会被立即求值为 `18`（一个原始值）。`watch` 收到的是数字 `18`，而不是对响应式属性的引用，因此无法追踪后续变化。

### immediate 选项的作用

```javascript
watch(
  () => state.age,
  (newVal, oldVal) => {
    console.log(newVal, oldVal); // 18 undefined（立即执行）
  },
  { immediate: true }
);
```

设置 `immediate: true` 后，回调会在 watch 创建时立即执行一次，此时 `oldVal` 为 `undefined`。

### deep 选项的作用

```javascript
const state = reactive({
  user: { name: 'John', profile: { age: 18 } },
});

watch(
  () => state.user,
  (newVal) => {
    console.log('user changed');
  },
  { deep: true }
);

state.user.profile.age = 20; // ✅ 会触发回调
```

设置 `deep: true` 后，`traverse` 函数会递归遍历整个对象，收集所有嵌套属性的依赖。

## 与 Scheduler 的关系

`watch` 通过 `scheduler` 与异步调度系统配合：

```typescript
const scheduler = () => queuePreFlushCb(job);
const effect = new ReactiveEffect(getter, scheduler);
```

当数据变化时：

1. `trigger()` 检测到 effect 存在 `scheduler`
2. 调用 `scheduler()` 而不是 `effect.run()`
3. `scheduler` 将 job 加入异步队列
4. 微任务阶段统一执行所有 job

这确保了：

- 多次数据变更只触发一次回调
- 回调在 DOM 更新前执行（Pre-Flush）

## 总结

| 特性             | 说明                                       |
| ---------------- | ------------------------------------------ |
| **响应式追踪**   | 通过 `ReactiveEffect` 实现依赖收集         |
| **异步批量执行** | 通过 `scheduler` 和 `queuePreFlushCb` 实现 |
| **深度侦听**     | 通过 `traverse` 递归收集嵌套属性依赖       |
| **立即执行**     | 通过 `immediate` 选项控制                  |
| **值变化检测**   | 通过 `hasChanged` 避免无意义的回调         |
