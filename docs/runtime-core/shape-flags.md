# Vue 3 核心原理笔记：ShapeFlags (位运算优化)

## 1. 什么是 ShapeFlags？

`ShapeFlags` 是 Vue 3 在虚拟 DOM (VNode) 设计中的一项重要优化。它本质上是一个 **枚举 (Enum)**，利用 **二进制位 (Bit)** 来高效地标记和存储 VNode 的类型信息。

### 核心作用

它将 **“节点本身的类型”**（如：是组件还是元素？）与 **“子节点的类型”**（如：是文本还是数组？）合并存储在一个数字属性 (`shapeFlag`) 中。

### 代码定义

```typescript
export const enum ShapeFlags {
  ELEMENT = 1, // 二进制: 0000 0001 (是普通 HTML 标签)
  FUNCTIONAL_COMPONENT = 1 << 1, // 二进制: 0000 0010 (是函数式组件)
  STATEFUL_COMPONENT = 1 << 2, // 二进制: 0000 0100 (是有状态组件)
  TEXT_CHILDREN = 1 << 3, // 二进制: 0000 1000 (子节点是纯文本)
  ARRAY_CHILDREN = 1 << 4, // 二进制: 0001 0000 (子节点是数组)
  SLOTS_CHILDREN = 1 << 5, // 二进制: 0010 0000 (子节点是插槽)

  // 组合类型：组件 (有状态 | 函数式)
  COMPONENT = ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT,
}
```

---

## 2. 核心机制：位运算

Vue 3 利用 CPU 处理极快的位运算来管理这些标记。

### 2.1 组合 (`|` 按位或) -> 用于“创建/标记”

**作用**：将多个特征合并到一个数字中。
**场景**：在 `createVNode` 阶段，确定节点类型和子节点类型。

```typescript
// 假设 type 是 'div' (ELEMENT)，children 是 'hello' (TEXT)
// ELEMENT(1) | TEXT_CHILDREN(8) = 9 (二进制 1001)
vnode.shapeFlag |= ShapeFlags.TEXT_CHILDREN;
```

_结果：`vnode.shapeFlag` 变成了 9，意味着“我是一个元素，且我的子节点是文本”。_

### 2.2 鉴权 (`&` 按位与) -> 用于“判断/读取”

**作用**：检查某个数字中是否包含特定特征。
**场景**：在 `patch` (Diff) 阶段，快速决定处理逻辑。

```typescript
// 极速判断：只有当 shapeFlag 中包含 TEXT_CHILDREN 位时，结果才非 0
if (n2.shapeFlag & ShapeFlags.TEXT_CHILDREN) {
  // 走快速通道：直接修改 textContent
}
```

---

## 3. 深度对比：使用 vs 不使用

ShapeFlags 的核心价值在于 **“空间换时间”** 和 **“预计算”**。以下是两种模式在 Patch（Diff）阶段的具体差异：

### 3.1 模式 A：不使用 ShapeFlags (Vue 2 / 传统模式)

**机制**：**现场推断 (Runtime Inference)**。
每次 Patch 时，渲染器对 VNode 一无所知，必须现场检查 `type` 和 `children` 的数据类型。

- **伪代码逻辑**：

```javascript
// 每次 Diff 都要跑这套逻辑
function patch(n1, n2) {
  // 1. 猜类型：先看 n2.type 是啥？
  if (typeof n2.type === 'string') {
    processElement();
  } else if (typeof n2.type === 'object') {
    processComponent();
  }

  // 2. 猜子节点：再看 n2.children 是啥？
  if (typeof n2.children === 'string') {
    setText();
  } else if (Array.isArray(n2.children)) {
    diffChildren();
  }
}
```

- **缺点**：

1. **性能损耗**：`typeof`、`Array.isArray` 在高频触发的渲染中，开销积少成多。
2. **逻辑冗余**：判断逻辑分散，代码不够简洁。

### 3.2 模式 B：使用 ShapeFlags (Vue 3 模式)

**机制**：**持证上岗 (Pre-computed)**。
在 `createVNode` 时已经计算好身份，Patch 时直接出示“身份证”。

- **伪代码逻辑**：

```javascript
// Diff 时直接读取标记，零推断
function patch(n1, n2) {
  const { shapeFlag } = n2;

  // 1. 位运算直接分发
  if (shapeFlag & ShapeFlags.ELEMENT) {
    // ...
    // 2. 内部直接处理子节点，无需看 children 具体内容
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      setText(); // ⚡️ 快速通道
    } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      diffChildren();
    }
  } else if (shapeFlag & ShapeFlags.COMPONENT) {
    processComponent();
  }
}
```

- **优点**：

1. **预计算**：将类型判断前置到创建阶段（低频），减轻更新阶段（高频）的负担。
2. **极速位运算**：CPU 处理二进制 `&` 操作比对象属性查找快得多。

---

## 4. 经典收益场景：跳过数组 Diff

这是 ShapeFlags 带来的最大性能红利之一。

**场景**：将一个包含 100 个 `<li>` 的 `<ul>` 更新为一段文本 `<ul>Loading...</ul>`。

| 步骤              | 不使用 ShapeFlags                                                | 使用 ShapeFlags                                                       |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| **1. 识别新节点** | 检查 `newChildren` 类型 -> 是字符串。                            | 检查 `shapeFlag & TEXT_CHILDREN` -> **命中**。                        |
| **2. 处理旧节点** | 检查 `oldChildren` 类型 -> 是数组 -> **遍历卸载** 100 个旧节点。 | **完全无视**旧节点具体是什么 (因为已知新的是文本，直接暴力覆盖即可)。 |
| **3. 执行更新**   | `elm.textContent = 'Loading...'`                                 | `elm.textContent = 'Loading...'`                                      |
| **结果**          | 做了很多无用的检查和遍历工作。                                   | **瞬间完成**，路径最短。                                              |

---

## 5. 总结

ShapeFlags 是 Vue 3 性能提升的基石之一。它通过在 **编译/创建阶段** 预先计算好节点的特征“身份”，使得在高频执行的 **渲染/更新阶段** 可以通过低成本的位运算实现**逻辑的快速分发**和**算法路径的剪枝**。
