# Computed 执行流程详解

## 概述

`computed` 是 Vue 响应式系统中的计算属性实现，它具有以下特点：

- **懒执行（Lazy Evaluation）**：只有在访问 `.value` 时才会执行计算
- **缓存机制**：通过 `_dirty` 标记实现缓存，避免重复计算
- **双向依赖收集**：
  1. computed 依赖的响应式数据（如 `state.age`）会收集 `computed.effect`
  2. 使用 computed 的外层 effect 会被 `computed.dep` 收集

## 示例代码分析

```javascript
const state = reactive({
  name: 'John',
  age: 18,
});

const doubleAge = computed(() => {
  console.log('state', JSON.stringify(state));
  return state.age * 2;
});

effect(() => {
  console.log('run', state);
  document.getElementById('p1').innerText = `Age: ${doubleAge.value} - p1`;
});

setTimeout(() => {
  state.age = 100; // 触发更新
}, 2000);
```

## ⚠️ 关键概念：两个 Effect 的区别

在这个例子中存在**两个不同的 effect**，这是理解 computed 的关键：

### 1. 外层 effect（用户创建）

```javascript
// 用户手动调用 effect() 创建
effect(() => {
  document.getElementById('p1').innerText = `Age: ${doubleAge.value}`;
});
```

对应源码 `effect.ts#30-33`：

```typescript
export function effect<T = any>(fn: () => T) {
  const _effect = new ReactiveEffect(fn); // 没有 scheduler
  _effect.run(); // 立即执行
}
```

创建的对象：

```javascript
{
  fn: () => { 更新 DOM... },
  scheduler: null,        // ❌ 没有调度器
  computed: undefined     // ❌ 不是 computed
}
```

### 2. computed.effect（computed 内部创建）

```javascript
// computed 内部自动创建
const doubleAge = computed(() => state.age * 2);
```

对应源码 `computed.ts#16-25`：

```typescript
constructor(getter: any) {
  this.effect = new ReactiveEffect(getter, () => {
    // 这是 scheduler 调度器！
    if (!this._dirty) {
      this._dirty = true;
      triggerRefValue(this);
    }
  });
  this.effect.computed = this;  // 标记为 computed
}
```

创建的对象：

```javascript
{
  fn: () => state.age * 2,   // getter 函数
  scheduler: () => {...},    // ✅ 有调度器
  computed: ComputedRefImpl  // ✅ 指向 computed 实例
}
```

### 对比表格

| 特性                | 外层 effect           | computed.effect              |
| ------------------- | --------------------- | ---------------------------- |
| **创建方式**        | 用户手动 `effect(fn)` | `computed()` 内部自动        |
| **fn 函数**         | 更新 DOM              | getter `() => state.age * 2` |
| **scheduler**       | ❌ null               | ✅ 有                        |
| **effect.computed** | ❌ undefined          | ✅ 指向 ComputedRefImpl      |
| **依赖变化时**      | 直接执行 `run()`      | 执行 `scheduler()`           |

### 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  state.age 的 dep: [computed.effect]                        │
│       │                                                     │
│       │ 当 state.age 变化                                   │
│       ▼                                                     │
│  触发 computed.effect.scheduler()                           │
│       │                                                     │
│       │ scheduler 内部调用 triggerRefValue                  │
│       ▼                                                     │
│  computed.dep: [外层 effect]                                │
│       │                                                     │
│       │ 触发外层 effect                                     │
│       ▼                                                     │
│  外层 effect.run() → 访问 doubleAge.value → 重新计算        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 数据流与依赖关系图（Mermaid）

```mermaid
flowchart TB
    subgraph 响应式数据层
        State["state = reactive({age: 18})"]
        StateAge["state.age"]
        StateAgeDep["state.age 的 dep<br/>Set类型"]
    end

    subgraph Computed层
        Computed["doubleAge = computed(getter)"]
        ComputedEffect["computed.effect<br/>ReactiveEffect"]
        ComputedDep["computed.dep<br/>Set类型"]
        ComputedValue["computed._value<br/>缓存值"]
        ComputedDirty["computed._dirty<br/>脏值标记"]
        Scheduler["scheduler()<br/>调度函数"]
    end

    subgraph Effect层
        OuterEffect["外层 effect<br/>ReactiveEffect"]
        OuterFn["fn: 更新DOM"]
    end

    subgraph DOM层
        DOM["页面UI"]
    end

    %% 依赖收集关系
    StateAge -->|"getter访问时<br/>track()"| StateAgeDep
    StateAgeDep -->|"收集"| ComputedEffect

    Computed -->|"访问.value时<br/>trackRefValue()"| ComputedDep
    ComputedDep -->|"收集"| OuterEffect

    %% 触发更新关系
    StateAge -.->|"修改时<br/>trigger()"| StateAgeDep
    StateAgeDep -.->|"遍历触发"| Scheduler
    Scheduler -.->|"_dirty=true"| ComputedDirty
    Scheduler -.->|"triggerRefValue()"| ComputedDep
    ComputedDep -.->|"遍历触发"| OuterEffect
    OuterEffect -.->|"run()"| OuterFn
    OuterFn -.->|"访问.value"| ComputedValue
    ComputedValue -.->|"_dirty?重算"| ComputedEffect
    OuterFn -.->|"更新"| DOM

    %% 样式
    style StateAgeDep fill:#ffecb3,stroke:#ff9800
    style ComputedDep fill:#ffecb3,stroke:#ff9800
    style ComputedEffect fill:#e3f2fd,stroke:#2196f3
    style OuterEffect fill:#e8f5e9,stroke:#4caf50
    style Scheduler fill:#ffebee,stroke:#f44336
```

### 依赖收集 vs 触发更新

```mermaid
flowchart LR
    subgraph 依赖收集阶段["🔗 依赖收集（读取时）"]
        direction TB
        R1["访问 state.age"] -->|"track()"| R2["state.age.dep.add(computed.effect)"]
        R3["访问 computed.value"] -->|"trackRefValue()"| R4["computed.dep.add(外层effect)"]
    end

    subgraph 触发更新阶段["⚡ 触发更新（修改时）"]
        direction TB
        T1["修改 state.age"] -->|"trigger()"| T2["遍历 state.age.dep"]
        T2 --> T3["调用 computed.effect.scheduler()"]
        T3 --> T4["_dirty = true"]
        T4 -->|"triggerRefValue()"| T5["遍历 computed.dep"]
        T5 --> T6["调用 外层effect.run()"]
        T6 --> T7["访问 computed.value"]
        T7 -->|"_dirty为true"| T8["调用 computed.effect.run()"]
        T8 --> T9["重新计算getter"]
    end

    style R2 fill:#fff3e0,stroke:#ff9800
    style R4 fill:#fff3e0,stroke:#ff9800
    style T3 fill:#ffebee,stroke:#f44336
    style T8 fill:#e3f2fd,stroke:#2196f3
```

### 双向依赖关系总结

```mermaid
flowchart LR
    A["state.age"] <-->|"依赖关系"| B["computed.effect"]
    B <-->|"包含于"| C["ComputedRefImpl"]
    C <-->|"依赖关系"| D["外层 effect"]
    D <-->|"访问"| E["DOM"]

    A -->|"dep收集"| B
    C -->|"dep收集"| D

    style A fill:#bbdefb,stroke:#1976d2
    style B fill:#fff9c4,stroke:#fbc02d
    style C fill:#c8e6c9,stroke:#388e3c
    style D fill:#ffccbc,stroke:#e64a19
```

## 完整执行流程图（带函数标注）

```mermaid
flowchart TD
    Start["🚀 开始执行代码"] --> CreateReactive["reactive(state)<br/>创建响应式对象"]
    CreateReactive --> CreateComputed["computed(() => state.age * 2)<br/>创建计算属性"]

    CreateComputed --> ComputedInit["new ComputedRefImpl(getter)<br/>构造函数执行"]
    ComputedInit --> CreateEffect["new ReactiveEffect(getter, scheduler)<br/>创建 computed.effect"]
    CreateEffect --> SetScheduler["设置 scheduler<br/>() => { _dirty=true; triggerRefValue }"]
    SetScheduler --> SetDirty["初始化: _dirty=true<br/>effect.computed=this"]

    SetDirty --> CreateOuterEffect["effect(fn)<br/>创建外层 effect"]
    CreateOuterEffect --> RunOuterEffect["外层effect.run()<br/>📌activeEffect=外层effect"]
    RunOuterEffect --> SetActiveEffect1["执行外层fn()<br/>开始执行副作用函数"]
    SetActiveEffect1 --> AccessComputedValue["访问 doubleAge.value<br/>触发 getter"]

    AccessComputedValue --> ComputedGetter["get value() 执行<br/>computed.ts#28"]
    ComputedGetter --> TrackRefValue1["trackRefValue(this)<br/>ref.ts#76"]
    TrackRefValue1 --> CollectOuterEffect["trackEffects(dep)<br/>computed.dep.add(外层effect)"]

    CollectOuterEffect --> CheckDirty1{"_dirty === true?"}
    CheckDirty1 -->|true 需计算| SetDirtyFalse["this._dirty = false"]
    SetDirtyFalse --> RunComputedEffect["this.effect.run()<br/>📌activeEffect=computed.effect"]
    RunComputedEffect --> SetActiveEffect2["执行getter函数<br/>() => state.age * 2"]
    SetActiveEffect2 --> ExecuteGetter["getter内部访问state.age"]

    ExecuteGetter --> AccessStateAge["触发Proxy get trap<br/>reactive.ts"]
    AccessStateAge --> TriggerReactiveGet["baseHandler.get()"]
    TriggerReactiveGet --> TrackStateAge["track(state, 'age')<br/>effect.ts#41"]
    TrackStateAge --> CollectComputedEffect["trackEffects(dep)<br/>state.age.dep.add(computed.effect)"]

    CollectComputedEffect --> ReturnValue["getter返回 18*2=36"]
    ReturnValue --> CacheValue["this._value = 36<br/>缓存结果"]
    CacheValue --> OuterEffectContinue["外层effect.fn()继续<br/>更新DOM"]

    OuterEffectContinue --> WaitTimeout["⏱️ setTimeout 2秒"]
    WaitTimeout --> ModifyAge["state.age = 100<br/>用户修改数据"]

    ModifyAge --> TriggerReactiveSet["触发Proxy set trap<br/>reactive.ts"]
    TriggerReactiveSet --> CallTrigger["trigger(state, 'age')<br/>effect.ts#66"]
    CallTrigger --> GetDep["获取dep<br/>dep = [computed.effect]"]
    GetDep --> TriggerEffects["triggerEffects(dep)<br/>effect.ts#76"]

    TriggerEffects --> PriorityComputed["优先处理computed<br/>if(effect.computed){...}"]
    PriorityComputed --> CheckScheduler{"triggerEffect(effect)<br/>effect.scheduler存在?"}
    CheckScheduler -->|是| CallScheduler["执行scheduler()<br/>computed.ts#16-23"]

    CallScheduler --> CheckDirty2{"scheduler内部<br/>_dirty === false?"}
    CheckDirty2 -->|false需更新| SetDirtyTrue["this._dirty = true"]
    SetDirtyTrue --> TriggerRefValue["triggerRefValue(this)<br/>ref.ts#70"]
    TriggerRefValue --> TriggerComputedDep["triggerEffects(computed.dep)<br/>触发[外层effect]"]

    TriggerComputedDep --> RerunOuterEffect["外层effect.run()<br/>📌activeEffect=外层effect"]
    RerunOuterEffect --> AccessComputedValue2["外层fn()再次访问<br/>doubleAge.value"]
    AccessComputedValue2 --> ComputedGetter2["get value()执行<br/>computed.ts#28"]
    ComputedGetter2 --> TrackRefValue2["trackRefValue(this)<br/>重新收集依赖"]

    TrackRefValue2 --> CheckDirty3{"_dirty === true?<br/>需要重新计算?"}
    CheckDirty3 -->|true需计算| SetDirtyFalse2["this._dirty = false"]
    SetDirtyFalse2 --> Recalculate["this.effect.run()<br/>📌activeEffect=computed.effect"]
    Recalculate --> GetNewValue["执行getter()<br/>100 * 2 = 200"]
    GetNewValue --> CacheNewValue["this._value = 200"]
    CacheNewValue --> UpdateUI["外层effect继续<br/>更新UI显示200"]

    CheckDirty3 -->|false用缓存| ReturnCached["return this._value<br/>返回缓存值"]
    UpdateUI --> End["✅ 流程结束"]
    ReturnCached --> End

    style CreateComputed fill:#e1f5ff,stroke:#0066cc,stroke-width:2px
    style SetActiveEffect1 fill:#d4edda,stroke:#28a745,stroke-width:2px
    style SetActiveEffect2 fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style SetActiveEffect3 fill:#d4edda,stroke:#28a745,stroke-width:2px
    style SetActiveEffect4 fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style ComputedGetter fill:#fff4e1,stroke:#ff9800,stroke-width:2px
    style ComputedGetter2 fill:#fff4e1,stroke:#ff9800,stroke-width:2px
    style CallScheduler fill:#ffe1e1,stroke:#dc3545,stroke-width:2px
    style Recalculate fill:#e1ffe1,stroke:#28a745,stroke-width:2px
```

### 📌 图例说明

| 颜色        | 含义                     | 示例                             |
| ----------- | ------------------------ | -------------------------------- |
| 🟢 绿色边框 | **外层 effect 激活**     | `activeEffect = 外层 effect`     |
| 🟡 黄色边框 | **computed.effect 激活** | `activeEffect = computed.effect` |
| 🔵 蓝色背景 | **computed 初始化**      | `new ComputedRefImpl(getter)`    |
| 🟠 橙色背景 | **computed getter 执行** | `computed.value getter`          |
| 🔴 红色背景 | **调度器执行**           | `scheduler()`                    |
| 🟢 绿色背景 | **重新计算**             | `effect.run()`                   |

## 关键阶段详解

### 1️⃣ 初始化阶段

```mermaid
sequenceDiagram
    participant User as 用户代码
    participant Computed as ComputedRefImpl
    participant Effect as ReactiveEffect

    User->>Computed: computed(getter)
    Computed->>Effect: new ReactiveEffect(getter, scheduler)
    Note over Effect: fn = getter<br/>scheduler = 调度函数
    Effect-->>Computed: effect 实例
    Note over Computed: _dirty = true<br/>_value = undefined<br/>dep = undefined
    Computed-->>User: computed 实例
```

**关键代码：**

```typescript
class ComputedRefImpl<T> {
  private _value!: T;
  public dep?: Dep = undefined;
  public _dirty = true; // 标记需要计算
  public readonly effect: ReactiveEffect<T>;

  constructor(getter: any) {
    this.effect = new ReactiveEffect(getter, () => {
      // scheduler: 当依赖变化时执行
      if (!this._dirty) {
        this._dirty = true;
        triggerRefValue(this); // 通知外层 effect
      }
    });
    this.effect.computed = this; // 标记为 computed effect
  }
}
```

### 2️⃣ 首次访问阶段

```mermaid
sequenceDiagram
    participant Outer as 外层 effect
    participant Computed as computed.value getter
    participant ComputedEffect as computed.effect
    participant State as state.age

    Note over Outer: activeEffect = 外层 effect
    Outer->>Computed: 访问 doubleAge.value
    Computed->>Computed: trackRefValue(this)
    Note over Computed: computed.dep 收集外层 effect

    Computed->>Computed: 检查 _dirty === true
    Computed->>Computed: 设置 _dirty = false
    Computed->>ComputedEffect: effect.run()
    Note over ComputedEffect: activeEffect = computed.effect

    ComputedEffect->>State: 访问 state.age
    State->>State: track(state, 'age')
    Note over State: state.age 的 dep<br/>收集 computed.effect

    State-->>ComputedEffect: 返回 18
    ComputedEffect-->>Computed: 返回 36 (18 * 2)
    Note over Computed: 缓存 _value = 36
    Computed-->>Outer: 返回 36
```

**依赖关系建立：**

```
state.age 的 dep: [computed.effect]
computed 的 dep: [外层 effect]
```

### 3️⃣ 响应式更新阶段

```mermaid
sequenceDiagram
    participant User as 用户代码
    participant StateAge as state.age setter
    participant Trigger as trigger 系统
    participant Scheduler as computed.scheduler
    participant ComputedDep as computed.dep
    participant Outer as 外层 effect

    User->>StateAge: state.age = 100
    StateAge->>Trigger: trigger(state, 'age')
    Trigger->>Trigger: 获取 state.age 的 dep
    Note over Trigger: dep = [computed.effect]

    Trigger->>Trigger: triggerEffects(dep)
    Note over Trigger: 优先处理 computed effect

    Trigger->>Scheduler: 调用 computed.effect.scheduler()
    Scheduler->>Scheduler: 检查 _dirty === false
    Scheduler->>Scheduler: 设置 _dirty = true
    Scheduler->>ComputedDep: triggerRefValue(computed)

    ComputedDep->>Outer: 触发外层 effect
    Outer->>Outer: effect.run()
    Note over Outer: 重新执行外层逻辑

    Outer->>Computed: 访问 doubleAge.value
    Note over Computed: _dirty === true，需要重新计算
    Computed->>ComputedEffect: effect.run()
    ComputedEffect->>StateAge: 访问 state.age
    StateAge-->>ComputedEffect: 返回 100
    ComputedEffect-->>Computed: 返回 200 (100 * 2)
    Computed-->>Outer: 返回 200
    Outer->>Outer: 更新 UI
```

### 4️⃣ 缓存机制

```mermaid
flowchart LR
    A["访问 computed.value"] --> B{"_dirty === true?"}
    B -->|是| C["执行 effect.run()"]
    C --> D["执行 getter 计算"]
    D --> E["设置 _dirty = false"]
    E --> F["缓存结果到 _value"]
    F --> G["返回 _value"]

    B -->|否| H["直接返回缓存的 _value"]
    H --> G

    style C fill:#ffe1e1
    style H fill:#e1ffe1
```

## 核心机制解析

### 🔑 双向依赖收集

1. **computed 收集外层 effect**
   - 时机：访问 `computed.value` 时
   - 位置：`trackRefValue(this)` 在 getter 开头
   - 作用：当 computed 值变化时，通知外层 effect 更新

2. **响应式数据收集 computed.effect**
   - 时机：computed 的 getter 执行时访问响应式数据
   - 位置：响应式数据的 `track()` 方法
   - 作用：当响应式数据变化时，通知 computed 重新计算

### 🔄 调度器（Scheduler）的作用

```typescript
// computed 的 scheduler
() => {
  if (!this._dirty) {
    this._dirty = true; // 标记需要重新计算
    triggerRefValue(this); // 通知依赖 computed 的 effect
  }
};
```

**为什么需要 scheduler？**

- 避免立即重新计算（懒执行）
- 只标记 `_dirty = true`，等下次访问时才计算
- 立即通知外层 effect，触发重新渲染

### ⚡ 优先级处理

在 `triggerEffects` 中，computed effect 优先执行：

```typescript
export function triggerEffects(dep: Dep) {
  // 优先触发计算属性
  dep.forEach((effect) => {
    if (effect.computed) {
      triggerEffect(effect);
    }
  });
  // 后触发非计算属性
  dep.forEach((effect) => {
    if (!effect.computed) {
      triggerEffect(effect);
    }
  });
}
```

**原因：**

- 确保 computed 先更新 `_dirty` 状态
- 外层 effect 执行时能获取最新的计算值

## 执行时序总结

| 步骤 | 操作                     | activeEffect    | \_dirty      | 依赖关系                          |
| ---- | ------------------------ | --------------- | ------------ | --------------------------------- |
| 1    | 创建 computed            | -               | true         | -                                 |
| 2    | 创建外层 effect          | -               | true         | -                                 |
| 3    | 外层 effect.run()        | 外层 effect     | true         | -                                 |
| 4    | 访问 doubleAge.value     | 外层 effect     | true         | computed.dep = [外层 effect]      |
| 5    | computed.effect.run()    | computed.effect | false        | state.age.dep = [computed.effect] |
| 6    | 修改 state.age           | -               | false        | -                                 |
| 7    | 触发 scheduler           | -               | true         | -                                 |
| 8    | 触发外层 effect          | 外层 effect     | true         | -                                 |
| 9    | 再次访问 doubleAge.value | 外层 effect     | true → false | 重新计算                          |

## 🔄 activeEffect 变化过程详解

`activeEffect` 是响应式系统中的一个核心全局变量，它指向**当前正在执行的 effect**。理解它的变化过程对于理解 computed 的双向依赖收集至关重要。

### 源码定义

```typescript
// effect.ts#9
export let activeEffect: ReactiveEffect | undefined;

// effect.ts#21-27
run() {
  activeEffect = this;  // 关键：将自己设为当前激活的 effect
  return this.fn();     // 执行副作用函数
}
```

### activeEffect 变化时间线

```mermaid
sequenceDiagram
    participant Global as activeEffect（全局变量）
    participant OuterEffect as 外层 effect
    participant ComputedEffect as computed.effect
    participant StateAge as state.age

    Note over Global: 初始值: undefined

    rect rgb(232, 245, 233)
        Note over Global: 阶段1: 外层 effect 执行
        OuterEffect->>Global: run() → activeEffect = 外层effect
        Note over Global: ✅ activeEffect = 外层effect
    end

    rect rgb(255, 243, 224)
        Note over Global: 阶段2: 访问 computed.value
        OuterEffect->>ComputedEffect: 访问 doubleAge.value
        Note over Global: trackRefValue() 收集外层effect<br/>此时 activeEffect = 外层effect
    end

    rect rgb(227, 242, 253)
        Note over Global: 阶段3: computed.effect.run()
        ComputedEffect->>Global: run() → activeEffect = computed.effect
        Note over Global: ✅ activeEffect = computed.effect
    end

    rect rgb(255, 236, 179)
        Note over Global: 阶段4: getter 访问 state.age
        ComputedEffect->>StateAge: 访问 state.age
        Note over Global: track() 收集 computed.effect<br/>此时 activeEffect = computed.effect
    end

    rect rgb(232, 245, 233)
        Note over Global: 阶段5: getter 执行完毕
        Note over Global: fn() 返回后<br/>activeEffect 仍为 computed.effect
    end
```

### 详细执行步骤

#### 1️⃣ 程序启动时

```javascript
// activeEffect = undefined（初始状态）
const state = reactive({ age: 18 });
const doubleAge = computed(() => state.age * 2);
// computed 创建时不执行 getter，activeEffect 保持 undefined
```

#### 2️⃣ 外层 effect 开始执行

```javascript
effect(() => {
  // 进入这里之前，effect.run() 已经执行
  // activeEffect = 外层 effect ✅

  console.log(doubleAge.value); // 访问 computed
});
```

**关键代码（effect.ts#30-33）：**

```typescript
export function effect<T = any>(fn: () => T) {
  const _effect = new ReactiveEffect(fn);
  _effect.run(); // 这里调用 run()，设置 activeEffect = _effect
}
```

#### 3️⃣ 访问 computed.value（getter 开头）

```typescript
// computed.ts#28-29
get value() {
  trackRefValue(this as any);  // 此时 activeEffect = 外层 effect
  // ↑ 收集依赖：computed.dep.add(外层 effect)
```

**依赖关系建立：**

```
computed.dep = [外层 effect]  // 因为 activeEffect 是外层 effect
```

#### 4️⃣ computed.effect.run() 执行

```typescript
// computed.ts#30-34
if (this._dirty) {
  this._dirty = false;
  this._value = this.effect.run(); // 🔄 activeEffect 切换！
  // ↑ run() 内部：activeEffect = computed.effect
}
```

**关键切换（effect.ts#21-27）：**

```typescript
run() {
  activeEffect = this;  // ← 此时 this 是 computed.effect
  return this.fn();     // 执行 getter
}
```

#### 5️⃣ getter 内部访问 state.age

```javascript
// getter: () => state.age * 2
// 访问 state.age 时，activeEffect = computed.effect
```

**依赖关系建立：**

```
state.age 的 dep = [computed.effect]  // 因为 activeEffect 是 computed.effect
```

### activeEffect 状态变化图

```mermaid
stateDiagram-v2
    [*] --> undefined: 程序启动
    undefined --> OuterEffect: effect(() => {...}).run()
    OuterEffect --> OuterEffect: trackRefValue(computed)<br/>收集外层effect
    OuterEffect --> ComputedEffect: computed.effect.run()
    ComputedEffect --> ComputedEffect: track(state, 'age')<br/>收集computed.effect
    ComputedEffect --> OuterEffect: 响应式更新时<br/>外层effect.run()

    state OuterEffect {
        [*] --> 执行外层fn
        执行外层fn --> 访问computed_value
    }

    state ComputedEffect {
        [*] --> 执行getter
        执行getter --> 访问响应式数据
    }
```

### 更新阶段的 activeEffect 变化

当 `state.age = 100` 触发更新时：

```mermaid
flowchart TD
    A["state.age = 100"] --> B["trigger() 触发"]
    B --> C["调用 computed.effect.scheduler()"]
    C --> D["scheduler 不调用 run()<br/>activeEffect 不变"]
    D --> E["triggerRefValue() 触发外层 effect"]
    E --> F["外层 effect.run()"]
    F --> G["activeEffect = 外层 effect"]
    G --> H["访问 computed.value"]
    H --> I["trackRefValue()<br/>收集外层 effect"]
    I --> J["computed.effect.run()"]
    J --> K["activeEffect = computed.effect"]
    K --> L["执行 getter，访问 state.age"]
    L --> M["track() 收集 computed.effect"]

    style C fill:#ffebee,stroke:#f44336
    style G fill:#e8f5e9,stroke:#4caf50
    style K fill:#fff3e0,stroke:#ff9800
```

### 💡 关键理解点

| 时机                                 | activeEffect 的值  | 收集到的依赖                         |
| ------------------------------------ | ------------------ | ------------------------------------ |
| `effect(() => {...})` 的 `fn` 执行时 | 外层 effect        | -                                    |
| `trackRefValue(computed)` 时         | 外层 effect        | `computed.dep.add(外层 effect)`      |
| `computed.effect.run()` 后           | computed.effect    | -                                    |
| `track(state, 'age')` 时             | computed.effect    | `state.age.dep.add(computed.effect)` |
| `scheduler()` 执行时                 | 不变（不调用 run） | -                                    |

### ⚠️ 重要注意事项

1. **activeEffect 只在 run() 中改变**

   ```typescript
   run() {
     activeEffect = this;  // 唯一改变 activeEffect 的地方
     return this.fn();
   }
   ```

2. **scheduler() 不会改变 activeEffect**
   - scheduler 是调度器，只是标记 `_dirty = true` 并通知外层 effect
   - 它不调用 `run()`，所以不会改变 `activeEffect`

3. **依赖收集依赖于 activeEffect**

   ```typescript
   export function trackEffects(dep: Dep) {
     if (!activeEffect) {
       return; // 没有激活的 effect 则不收集
     }
     dep.add(activeEffect); // 收集当前激活的 effect
   }
   ```

4. **这就是双向依赖收集的秘密**
   - `trackRefValue(computed)` 时，`activeEffect = 外层 effect`，所以 `computed.dep` 收集到外层 effect
   - `track(state, 'age')` 时，`activeEffect = computed.effect`，所以 `state.age.dep` 收集到 computed.effect

## 常见疑问解答

### ❓ 为什么 computed 这么绕？

因为它实现了三个复杂机制：

1. **懒执行**：不访问不计算
2. **缓存**：避免重复计算
3. **双向依赖**：既依赖数据，又被 effect 依赖

### ❓ \_dirty 的作用是什么？

- `_dirty = true`：需要重新计算
- `_dirty = false`：可以使用缓存值

### ❓ 为什么需要 scheduler？

如果没有 scheduler，依赖变化时会立即重新计算，失去了懒执行的优势。有了 scheduler：

1. 依赖变化 → 只标记 `_dirty = true`
2. 通知外层 effect
3. 外层 effect 访问时才重新计算

### ❓ 为什么 scheduler 调用 triggerRefValue 不会导致死循环？

这是一个非常好的问题！看起来 scheduler → triggerRefValue → triggerEffects → ... 可能会无限循环，但 Vue 有**两个精妙的防护机制**：

#### 防护机制一：`_dirty` 标记的条件判断

```typescript
// computed.ts#16-22
this.effect = new ReactiveEffect(getter, () => {
  if (!this._dirty) {
    // 🔑 关键条件！
    this._dirty = true;
    triggerRefValue(this as any);
  }
});
```

| 步骤                   | `_dirty` 值 | `!this._dirty` | 是否进入 if |
| ---------------------- | ----------- | -------------- | ----------- |
| 初始状态               | `true`      | `false`        | ❌ 不进入   |
| 首次访问 .value 后     | `false`     | -              | -           |
| 第一次触发 scheduler   | `false`     | `true`         | ✅ 进入     |
| scheduler 内设置       | `true`      | -              | -           |
| 如果再次触发 scheduler | `true`      | `false`        | ❌ 不进入   |

**关键**：一旦 `_dirty = true` 被设置，后续的 scheduler 调用会被 `if (!this._dirty)` 阻挡。

#### 防护机制二：执行路径的本质区别

```mermaid
flowchart TD
    A["state.age = 100"] --> B["trigger(state, 'age')"]
    B --> C["triggerEffect(computed.effect)"]
    C --> D{"有 scheduler?"}
    D -->|是| E["scheduler()"]
    E --> F["_dirty = true"]
    F --> G["triggerRefValue(computed)"]
    G --> H["外层 effect.run()"]
    H --> I["访问 doubleAge.value"]
    I --> J["get value()"]
    J --> K{"_dirty === true?"}
    K -->|是| L["_dirty = false"]
    L --> M["computed.effect.run()"]
    M --> N["执行 getter"]
    N --> O["读取 state.age"]
    O --> P["track() 收集依赖"]
    P --> Q["返回新值"]

    style E fill:#ffebee,stroke:#f44336
    style M fill:#e3f2fd,stroke:#2196f3
    style O fill:#e8f5e9,stroke:#4caf50
    style P fill:#fff3e0,stroke:#ff9800
```

**三个关键区别：**

1. **读取不触发更新**

   ```
   getter 内部读取 state.age
       ↓
   只触发 track()（收集依赖）
       ↓
   不触发 trigger()（不更新）
   ```

2. **run() ≠ scheduler**

   ```typescript
   // triggerEffect 中（trigger 触发时）
   if (effect.scheduler) {
     effect.scheduler();  // 走 scheduler 分支
   } else {
     effect.run();
   }

   // run() 中（直接调用时）
   run() {
     activeEffect = this;
     return this.fn();  // 直接执行 fn，不走 scheduler！
   }
   ```

3. **执行路径完全不同**

   | 场景                    | 触发方式          | 执行内容                      |
   | ----------------------- | ----------------- | ----------------------------- |
   | `state.age = 100`       | `triggerEffect()` | 调用 `scheduler()`            |
   | `computed.effect.run()` | 直接调用 `run()`  | 执行 `getter`，跳过 scheduler |

#### 完整的不会死循环的证明

```
state.age = 100
    │
    ▼
trigger() → scheduler()
    │
    ├─→ _dirty = false? ✅ 首次进入
    │       │
    │       ▼
    │   _dirty = true
    │       │
    │       ▼
    │   triggerRefValue() → 外层 effect.run()
    │       │
    │       ▼
    │   访问 computed.value → get value()
    │       │
    │       ├─→ _dirty === true? ✅
    │       │       │
    │       │       ▼
    │       │   _dirty = false
    │       │       │
    │       │       ▼
    │       │   computed.effect.run() ← 直接调用，不走 scheduler！
    │       │       │
    │       │       ▼
    │       │   getter 执行，读取 state.age
    │       │       │
    │       │       ▼
    │       │   track() 收集依赖 ← 只收集，不触发！
    │       │       │
    │       │       ▼
    │       │   返回新值 200
    │       │
    │       ▼
    │   流程结束 ✅
    │
    ▼
如果再次调用 scheduler
    │
    ├─→ _dirty = true? (_dirty 现在是 false，因为刚才 get value() 设置过)
    │   等等... 让我重新分析
    │
    ▼
实际上外层 effect.run() 执行完后，_dirty = false
    │
    ▼
此时如果有新的 trigger，scheduler 会再次被调用
    │
    ├─→ _dirty = false? ✅ 可以进入
    │
    ▼
但这是一个新的更新周期，不是死循环！
```

#### 总结：为什么不会死循环

| 可能的循环点          | 为什么不会循环                               |
| --------------------- | -------------------------------------------- |
| scheduler 重复调用    | 同一更新周期内，`_dirty = true` 后条件不满足 |
| getter 读取 state.age | 读取只触发 `track()`，不触发 `trigger()`     |
| computed.effect.run() | 直接执行 `fn()`，跳过 scheduler 逻辑         |

**Vue 的精妙设计**：用 `_dirty` 标记位和执行路径的区分，优雅地避免了死循环。

### ❓ trackRefValue 为什么在 getter 开头？

确保每次访问 `computed.value` 时，都能收集当前的 `activeEffect`，建立正确的依赖关系。

## 🎯 外层 effect 与 computed.effect 执行时机对比

在 computed 的执行流程中，存在两个不同的 effect，它们的执行时机有本质区别。

### 创建时机对比流程图

```mermaid
flowchart LR
    subgraph 外层effect创建["外层 effect 创建流程"]
        direction TB
        A1["effect(() => {...})"] --> A2["new ReactiveEffect(fn)"]
        A2 --> A3["无 scheduler"]
        A3 --> A4["✅ 立即调用 run()"]
        A4 --> A5["fn() 执行"]
    end

    subgraph computedEffect创建["computed.effect 创建流程"]
        direction TB
        B1["computed(() => state.age * 2)"] --> B2["new ComputedRefImpl(getter)"]
        B2 --> B3["new ReactiveEffect(getter, scheduler)"]
        B3 --> B4["✅ 有 scheduler"]
        B4 --> B5["❌ 不调用 run()"]
        B5 --> B6["懒执行，等待访问 .value"]
    end

    style A4 fill:#e8f5e9,stroke:#4caf50
    style A5 fill:#e8f5e9,stroke:#4caf50
    style B5 fill:#ffebee,stroke:#f44336
    style B6 fill:#fff3e0,stroke:#ff9800
```

**代码对比：**

```typescript
// 外层 effect 创建
export function effect<T = any>(fn: () => T) {
  const _effect = new ReactiveEffect(fn);  // 没有 scheduler
  _effect.run();  // ✅ 立即执行 run()
}

// computed.effect 创建
constructor(getter: any) {
  this.effect = new ReactiveEffect(getter, () => {  // ✅ 有 scheduler
    if (!this._dirty) {
      this._dirty = true;
      triggerRefValue(this as any);
    }
  });
  this.effect.computed = this;
  // ❌ 不调用 run()，懒执行
}
```

### 首次执行时机对比流程图

```mermaid
flowchart TB
    subgraph 时间线["执行时间线"]
        direction LR
        T1["T1"] --> T2["T2"] --> T3["T3"] --> T4["T4"]
    end

    subgraph T1阶段["T1: reactive() 创建"]
        R1["const state = reactive({age: 18})"]
    end

    subgraph T2阶段["T2: computed() 创建"]
        C1["const doubleAge = computed(getter)"]
        C2["创建 computed.effect"]
        C3["❌ getter 不执行"]
        C1 --> C2 --> C3
    end

    subgraph T3阶段["T3: effect() 创建"]
        E1["effect(() => {...})"]
        E2["创建外层 effect"]
        E3["✅ 立即执行 run()"]
        E4["执行外层 fn"]
        E1 --> E2 --> E3 --> E4
    end

    subgraph T4阶段["T4: 访问 .value"]
        V1["外层 fn 访问 doubleAge.value"]
        V2["触发 get value()"]
        V3["✅ computed.effect.run()"]
        V4["getter 执行"]
        V1 --> V2 --> V3 --> V4
    end

    T1 --> T1阶段
    T2 --> T2阶段
    T3 --> T3阶段
    T4 --> T4阶段

    style C3 fill:#ffebee,stroke:#f44336
    style E3 fill:#e8f5e9,stroke:#4caf50
    style E4 fill:#e8f5e9,stroke:#4caf50
    style V3 fill:#e3f2fd,stroke:#2196f3
    style V4 fill:#e3f2fd,stroke:#2196f3
```

**执行顺序示例：**

```javascript
console.log('1. 开始');

const state = reactive({ age: 18 });
console.log('2. reactive 创建完成');

const doubleAge = computed(() => {
  console.log('4. computed getter 执行'); // 不是这里！
  return state.age * 2;
});
console.log('3. computed 创建完成，getter 还未执行');

effect(() => {
  console.log('5. 外层 effect 开始执行');
  const val = doubleAge.value; // 这里才触发 getter
  console.log('6. 获取到值:', val);
});

// 输出顺序：
// 1. 开始
// 2. reactive 创建完成
// 3. computed 创建完成，getter 还未执行
// 5. 外层 effect 开始执行
// 4. computed getter 执行
// 6. 获取到值: 36
```

### 依赖变化时的执行时机对比流程图

```mermaid
flowchart TB
    Start["state.age = 100<br/>触发 trigger()"]

    Start --> TriggerEffects["triggerEffects(dep)"]
    TriggerEffects --> ForEach["遍历 dep 中的 effect"]

    ForEach --> CheckComputed{"effect.computed<br/>存在?"}

    CheckComputed -->|"是 (computed.effect)"| Priority["优先处理"]
    CheckComputed -->|"否 (外层 effect)"| Later["后处理"]

    Priority --> TriggerEffect1["triggerEffect(effect)"]
    Later --> TriggerEffect2["triggerEffect(effect)"]

    TriggerEffect1 --> HasScheduler{"effect.scheduler<br/>存在?"}
    TriggerEffect2 --> HasScheduler2{"effect.scheduler<br/>存在?"}

    HasScheduler -->|"✅ 是"| CallScheduler["调用 scheduler()"]
    HasScheduler -->|"否"| CallRun1["调用 run()"]

    HasScheduler2 -->|"是"| CallScheduler2["调用 scheduler()"]
    HasScheduler2 -->|"❌ 否"| CallRun2["调用 run()"]

    CallScheduler --> SchedulerLogic["_dirty = true<br/>triggerRefValue()"]
    CallRun2 --> RunLogic["执行副作用函数 fn()"]

    subgraph computed_path["computed.effect 路径"]
        CallScheduler
        SchedulerLogic
    end

    subgraph outer_path["外层 effect 路径"]
        CallRun2
        RunLogic
    end

    style CallScheduler fill:#fff3e0,stroke:#ff9800
    style SchedulerLogic fill:#fff3e0,stroke:#ff9800
    style CallRun2 fill:#e8f5e9,stroke:#4caf50
    style RunLogic fill:#e8f5e9,stroke:#4caf50
```

**关键区别代码：**

```typescript
// effect.ts#91-96
export function triggerEffect(effect: ReactiveEffect) {
  if (effect.scheduler) {
    effect.scheduler(); // computed.effect 走这里
  } else {
    effect.run(); // 外层 effect 走这里
  }
}
```

### 完整执行时机时序图

```mermaid
sequenceDiagram
    participant User as 用户代码
    participant Outer as 外层 effect
    participant Computed as computed.effect
    participant State as state.age

    rect rgb(232, 245, 233)
        Note over User: 初始化阶段
        User->>State: reactive({age: 18})
        User->>Computed: computed(getter)
        Note over Computed: 创建但不执行 ❌
        User->>Outer: effect(fn)
        Note over Outer: 创建并立即执行 ✅
    end

    rect rgb(227, 242, 253)
        Note over Outer: 首次执行阶段
        Outer->>Outer: run() 执行
        Outer->>Computed: 访问 .value
        Computed->>Computed: run() 执行 ✅
        Computed->>State: 访问 state.age
        State-->>Computed: 返回 18
        Computed-->>Outer: 返回 36
        Outer->>Outer: 更新 DOM
    end

    rect rgb(255, 243, 224)
        Note over User: 2秒后更新阶段
        User->>State: state.age = 100
        State->>Computed: trigger → scheduler() ⚡
        Note over Computed: _dirty = true
        Computed->>Outer: triggerRefValue → run()
    end

    rect rgb(232, 245, 233)
        Note over Outer: 重新执行阶段
        Outer->>Outer: run() 执行 ✅
        Outer->>Computed: 访问 .value
        Note over Computed: _dirty = true
        Computed->>Computed: run() 执行 ✅
        Computed->>State: 访问 state.age
        State-->>Computed: 返回 100
        Computed-->>Outer: 返回 200
        Outer->>Outer: 更新 DOM
    end
```

### 执行时机总结表

| 场景                                | 外层 effect         | computed.effect       |
| ----------------------------------- | ------------------- | --------------------- |
| **创建时**                          | ✅ 立即执行 `run()` | ❌ 不执行，懒加载     |
| **首次访问 `.value`**               | -                   | ✅ 执行 `run()`       |
| **依赖变化（trigger）**             | ✅ 执行 `run()`     | ⚡ 执行 `scheduler()` |
| **`.value` 被访问且 `_dirty=true`** | -                   | ✅ 执行 `run()`       |

### 两种 effect 生命周期对比图

```mermaid
flowchart TB
    subgraph 外层effect生命周期["外层 effect 生命周期"]
        direction LR
        OE1["创建"] -->|"立即"| OE2["run()"]
        OE2 --> OE3["等待依赖变化"]
        OE3 -->|"trigger"| OE4["run()"]
        OE4 --> OE3
    end

    subgraph computedEffect生命周期["computed.effect 生命周期"]
        direction LR
        CE1["创建"] -->|"等待"| CE2["访问 .value"]
        CE2 -->|"_dirty=true"| CE3["run()"]
        CE3 --> CE4["等待依赖变化"]
        CE4 -->|"trigger"| CE5["scheduler()"]
        CE5 -->|"_dirty=true"| CE6["等待访问 .value"]
        CE6 --> CE2
    end

    style OE2 fill:#e8f5e9,stroke:#4caf50
    style OE4 fill:#e8f5e9,stroke:#4caf50
    style CE3 fill:#e3f2fd,stroke:#2196f3
    style CE5 fill:#fff3e0,stroke:#ff9800
```

### 为什么这样设计？

```mermaid
flowchart TB
    subgraph 外层effect设计["外层 effect 设计理念"]
        O1["用户调用 effect()"]
        O2["期望副作用立即生效"]
        O3["例如：渲染 DOM、发起请求"]
        O4["✅ 创建时立即执行 run()"]
        O5["✅ 依赖变化时立即执行 run()"]
        O1 --> O2 --> O3 --> O4 --> O5
    end

    subgraph computedEffect设计["computed.effect 设计理念"]
        C1["computed 是惰性的"]
        C2["可能永远不会被使用"]
        C3["避免不必要的计算开销"]
        C4["❌ 创建时不执行"]
        C5["⚡ 依赖变化时只标记 dirty"]
        C6["✅ 访问时才真正计算"]
        C1 --> C2 --> C3 --> C4 --> C5 --> C6
    end

    style O4 fill:#e8f5e9,stroke:#4caf50
    style O5 fill:#e8f5e9,stroke:#4caf50
    style C4 fill:#ffebee,stroke:#f44336
    style C5 fill:#fff3e0,stroke:#ff9800
    style C6 fill:#e3f2fd,stroke:#2196f3
```

**设计原因总结：**

1. **外层 effect 立即执行** - 用户调用 `effect()` 期望副作用立即生效（如渲染 DOM）
2. **computed.effect 懒执行** - 避免不必要的计算，只有真正需要值时才计算
3. **computed 依赖变化时执行 scheduler** - 保持懒执行特性，只标记"脏"，下次访问时才计算
4. **外层 effect 依赖变化时直接执行 run** - 副作用需要立即响应数据变化

## 📦 trigger 时 dep 里有什么？

在 computed 场景中，存在**两个不同的 dep**，它们在不同时机被触发。

### 示例代码

```javascript
const state = reactive({ age: 18 });
const doubleAge = computed(() => state.age * 2);

effect(() => {
  document.body.innerText = doubleAge.value;
});

state.age = 100; // 触发更新
```

### 两个 dep 的内容

| dep 所属           | dep 内容            | 何时收集                   | 何时触发                              |
| ------------------ | ------------------- | -------------------------- | ------------------------------------- |
| `state.age` 的 dep | `[computed.effect]` | getter 访问 `state.age` 时 | `state.age = 100` 时                  |
| `computed` 的 dep  | `[外层 effect]`     | 外层 fn 访问 `.value` 时   | scheduler 调用 `triggerRefValue()` 时 |

### dep 是怎么来的？

#### 1. `state.age` 的 dep 收集 `computed.effect`

```javascript
// 代码执行路径
doubleAge.value              // 访问 computed
  → get value()              // computed.ts#28
    → this.effect.run()      // 执行 getter
      → activeEffect = computed.effect  // ⬅️ 关键！
        → () => state.age * 2  // getter 执行
          → 读取 state.age     // 触发 Proxy get
            → track(state, 'age')  // effect.ts#41
              → dep.add(activeEffect)  // ⬅️ 收集 computed.effect
```

**结果**：`state.age` 的 dep = `[computed.effect]`

#### 2. `computed` 的 dep 收集 `外层 effect`

```javascript
// 代码执行路径
effect(() => { ... })        // 创建外层 effect
  → _effect.run()            // effect.ts#32
    → activeEffect = 外层 effect  // ⬅️ 关键！
      → fn()                 // 执行外层 fn
        → doubleAge.value    // 访问 computed
          → get value()      // computed.ts#28
            → trackRefValue(this)  // ⬅️ 在 getter 开头！
              → dep.add(activeEffect)  // ⬅️ 收集外层 effect
```

**结果**：`computed` 的 dep = `[外层 effect]`

### trigger 时的调用链

```
state.age = 100
    │
    ▼
trigger(state, 'age')
    │
    ▼
triggerEffects(state.age的dep)  ← dep = [computed.effect]
    │
    ▼
computed.effect.scheduler()
    │
    ├── _dirty = true
    │
    ▼
triggerRefValue(computed)
    │
    ▼
triggerEffects(computed的dep)  ← dep = [外层 effect]
    │
    ▼
外层 effect.run()
```

### 一句话总结

| 时机                    | 谁在读数据              | activeEffect 是谁 | 谁被收集到 dep                         |
| ----------------------- | ----------------------- | ----------------- | -------------------------------------- |
| getter 访问 `state.age` | `computed.effect.run()` | `computed.effect` | `state.age.dep` 收集 `computed.effect` |
| 外层 fn 访问 `.value`   | `外层 effect.run()`     | `外层 effect`     | `computed.dep` 收集 `外层 effect`      |
