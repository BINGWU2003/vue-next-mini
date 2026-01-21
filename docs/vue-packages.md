# Vue 3 源码核心包架构解析

Vue 3 的源码主要位于 `packages` 目录下。我们可以根据功能将这些包划分为三个核心层级：**响应式系统**、**运行时（Runtime）**、**编译器（Compiler）**，以及辅助工具包。

## 1. 响应式系统层 (The Soul)

### 📂 `reactivity`

这是 Vue 3 的灵魂所在，包含所有响应式核心逻辑。它独立于 DOM，也不依赖组件系统。

- **功能**：提供 `ref`, `reactive`, `computed`, `effect` 等 API。
- **特点**：它可以作为一个独立的库被 React、Angular 或 Node.js 使用。
- **代码示例**：

```javascript
// 这里的代码完全不依赖 Vue 的组件或 DOM
import { reactive, effect } from '@vue/reactivity';

const state = reactive({ count: 0 });

// 注册副作用函数
effect(() => {
  console.log(`Count changed to: ${state.count}`);
});

state.count++; // 控制台输出: Count changed to: 1
```

---

## 2. 运行时层 (The Body)

这一层负责创建应用、渲染组件、处理 Diff 算法等，但它被拆分成了“平台无关”和“平台特定”两部分。

### 📂 `runtime-core` (核心运行时)

这是 Vue 运行时的**大脑**。它包含与平台无关的渲染逻辑。

- **核心功能**：
- **虚拟 DOM (VNode)** 的创建与 Diff 算法。
- **组件生命周期**管理 (`onMounted`, `setup` 执行)。
- **依赖注入** (`provide`/`inject`)。
- **Renderer API** 定义：它定义了渲染器该怎么工作，但不知道具体怎么操作 DOM（比如它知道要“创建一个元素”，但不知道是创建 `<div>` 还是 Canvas 图形）。

- **代码场景**：
  如果你想开发一个渲染到 Canvas 或小程序的 Vue 框架，你需要依赖这个包，并实现具体的节点操作逻辑。

```javascript
import { createRenderer } from '@vue/runtime-core';

// 自定义渲染器（比如渲染到终端或 Canvas）
const { createApp } = createRenderer({
  createElement(type) {
    /* 自定义创建逻辑 */
  },
  patchProp(el, key, prevValue, nextValue) {
    /* 自定义属性更新 */
  },
  insert(el, parent) {
    /* 自定义插入逻辑 */
  },
  // ...
});
```

### 📂 `runtime-dom` (浏览器运行时)

这是 Vue 运行时的**手脚**。它是专门为浏览器环境编写的适配层。

- **核心功能**：
- 基于 `runtime-core` 构建。
- 实现了 `runtime-core` 需要的接口（DOM 操作 API），如 `document.createElement`, `node.addEventListener`。
- 处理浏览器特有的属性（如 `style`, `class`, 事件绑定）。

- **代码场景**：
  我们在 Web 开发中使用的 `createApp` 其实是 `runtime-dom` 提供的。

```javascript
import { createApp } from 'vue'; // 实际上导出自 runtime-dom

createApp({
  template: `<div>Hello World</div>`,
}).mount('#app');
```

### 📂 `runtime-test`

这是一个轻量级的运行时，专门用于测试。它渲染出的不是真实的 DOM，而是纯 JavaScript 对象树，方便在没有浏览器的环境中（如 Jest）测试 Vue 的内核逻辑。

---

## 3. 编译器层 (The Translator)

这一层负责将我们写的模板（Template）编译成渲染函数（Render Function）。

### 📂 `compiler-core` (核心编译器)

平台无关的编译核心。

- **核心功能**：
- **Parse**：将模板字符串解析为抽象语法树 (AST)。
- **Transform**：处理指令（`v-if`, `v-for`）和优化 AST。
- **Codegen**：将 AST 生成为 JavaScript 代码字符串（即 render 函数）。

### 📂 `compiler-dom` (浏览器编译器)

基于 `compiler-core`，增加了针对浏览器的编译规则。

- **功能**：
- 处理 HTML 标签（如 `<div>` 是原生标签，`MyComponent` 是组件）。
- 处理浏览器特定的指令（如 `v-model` 在 input 上的编译逻辑，`v-html` 的安全性处理）。

### 📂 `compiler-sfc` (单文件组件编译器)

这是我们开发中最常用的包，通常由构建工具（Vite, Webpack/vue-loader）调用。

- **功能**：
- 解析 `.vue` 文件。
- 提取 `<template>`, `<script>`, `<style>` 块并分别交给对应的处理器处理。

- **代码示意**：

```javascript
import { parse } from '@vue/compiler-sfc';

const sfcContent = `
<template>
  <h1>{{ msg }}</h1>
</template>
<script setup>
const msg = 'Hello';
</script>
`;

const { descriptor } = parse(sfcContent);
console.log(descriptor.template.content); // 获取模板部分
```

### 📂 `compiler-ssr`

专门用于服务端渲染（SSR）的编译器。它会将模板编译成字符串拼接的函数，而不是创建 VNode 的函数，以提高服务端渲染性能。

---

## 4. 其他重要包

### 📂 `server-renderer`

服务端渲染的运行时逻辑。

- **功能**：接收一个 Vue 应用实例，将其渲染为 HTML 字符串或流（Stream）。
- **代码示意**：

```javascript
import { renderToString } from '@vue/server-renderer';
import { createSSRApp } from 'vue';

const app = createSSRApp({ data: () => ({ msg: 'SSR' }), template: '<div>{{msg}}</div>' });
const html = await renderToString(app);
// 输出: <div data-server-rendered="true">SSR</div>
```

### 📂 `shared` (共享库)

- **功能**：存放整个 Vue 仓库通用的工具函数、常量和类型定义。
- **例子**：`isObject`, `extend`, `ShapeFlags` (用于位运算标记节点类型)。所有的包都会依赖这个包。

### 📂 `vue` (入口包)

- **功能**：这是面向用户的“完整包”。
- **包含**：它聚合了 `compiler-dom` 和 `runtime-dom`。
- **作用**：如果你直接在 HTML 中用 `<script src="vue.js">` 引入 Vue，用的就是这个包。它包含了运行时编译器，所以你可以直接在 DOM 中写模板。而在 Vite/Webpack 项目中，我们通常只使用 `runtime-dom`，编译工作在构建阶段由 `compiler-sfc` 完成。

### 📂 `vue-compat`

- **功能**：Vue 3 的兼容构建版本，提供 Vue 2 的 API 适配，帮助用户从 Vue 2 迁移到 Vue 3。

---

## 总结：Vue 3 的运行流程

当你执行 `createApp(App).mount('#app')` 时，这些包是这样协作的：

1. **编译阶段**（构建时）：

- `.vue` 文件被 **`compiler-sfc`** 解析。
- 模板部分被 **`compiler-dom`** (底层调用 **`compiler-core`**) 编译成 render 函数。

2. **运行时阶段**（浏览器中）：

- **`runtime-dom`** 创建应用实例。
- **`runtime-core`** 调用 render 函数，生成虚拟 DOM (VNode)。
- render 函数执行过程中读取响应式数据，触发 **`reactivity`** 的依赖收集。
- **`runtime-core`** 对比新旧 VNode (Diff)，通过 **`runtime-dom`** 提供的 DOM API 更新真实页面。
