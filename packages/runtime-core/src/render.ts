import { EMPTY_OBJ, extend, isString, ShapeFlags } from '@vue-next-mini/shared';
import { Fragment, isSameVNodeType, Text } from './vnode';
import type { VNode } from './vnode';
import { nodeOps, patchProp } from '@vue-next-mini/runtime-dom';
import { createComponentInstance, setupComponent } from './component';
import { normalizeVNode, renderComponentRoot } from './componentRenderUtils';
import { ReactiveEffect } from '@vue-next-mini/reactivity';
import { queuePreFlushCb } from './scheduler';
export type RendererOptions = {
  // 为element的prop打补丁
  patchProp(el: Element, key: string, prevValue: any, nextValue: any): void;
  // 为element设置text
  setElementText(el: Element, text: string): void;
  // 在parent中插入el，参考anchor的位置
  insert(el: Element, parent: Element, anchor?: Element | null): void;
  // 创建element
  createElement(type: string): Element;
  // 删除el
  remove(el: Element): void;
  // 创建文本节点
  createText(text: string): Text;
  // 设置文本节点的文本
  setText(node: Text, text: string): void;
};

export function createRenderer(options: RendererOptions) {
  return baseCreateRenderer(options);
}

function baseCreateRenderer(options: RendererOptions) {
  const { patchProp, setElementText, insert, createElement, remove, createText, setText } = options;

  const processElement = (
    oldVNode: VNode | null,
    newVNode: VNode,
    container: Element,
    anchor?: Element | null
  ) => {
    if (oldVNode == null) {
      // 挂载元素
      mountElement(newVNode, container, anchor);
    } else {
      // 更新元素
      patchElement(oldVNode, newVNode);
    }
  };
  const processComponent = (
    oldVNode: VNode | null,
    newVNode: VNode,
    container: Element,
    anchor?: Element | null
  ) => {
    if (oldVNode == null) {
      // 挂载组件
      mountComponent(newVNode, container, anchor);
    } else {
      // 更新组件
    }
  };
  const processText = (oldVNode: VNode | null, newVNode: VNode, container: Element) => {
    if (oldVNode == null) {
      // 挂载文本节点
      const textNode = createText(newVNode.children as string);
      newVNode.el = textNode as any; // el can be Text or Element
      insert(textNode as any, container);
    } else {
      // 更新文本节点
      const el = (newVNode.el = oldVNode.el!) as unknown;
      const oldText = oldVNode.children as string;
      const newText = newVNode.children as string;
      if (oldText !== newText) {
        setText(el as Text, newText);
      }
    }
  };
  const mountElement = (vnode: VNode, container: Element, anchor?: Element | null) => {
    const { type, props, children, shapeFlag } = vnode;
    const el = (vnode.el = createElement(type));
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      setElementText(el, children);
    } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      mountChildren(children, el, anchor);
    }
    if (props) {
      for (const key in props) {
        const val = props[key];
        patchProp(el, key, null, val);
      }
    }
    insert(el, container, anchor);
  };
  const mountChildren = (children: any[], container: Element, anchor?: Element | null) => {
    if (isString(children)) {
      children = children.split('');
    }
    children.forEach((child) => {
      // 处理子节点
      const childVNode = (child = normalizeVNode(child));
      patch(null, childVNode, container, anchor);
    });
  };
  const mountComponent = (vnode: VNode, container: Element, anchor?: Element | null) => {
    vnode.component = createComponentInstance(vnode);
    const instance = vnode.component;
    setupComponent(instance);
    // 渲染组件
    setupRenderEffect(instance, vnode, container, anchor);
  };
  const setupRenderEffect = (
    instance: any,
    vnode: VNode,
    container: Element,
    anchor?: Element | null
  ) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        const { bm, m } = instance;
        if (bm) {
          bm();
        }
        // renderComponentRoot 的执行会触发依赖收集
        // 把组件的render函数返回值转换成vnode
        // component.render  -> vnode
        const subTree = (instance.subTree = renderComponentRoot(instance));
        // 挂载subTree
        patch(null, subTree, container, anchor);
        if (m) {
          m();
        }
        // 挂载子节点
        vnode.el = subTree.el;
        instance.isMounted = true;
      } else {
        // 组件更新
        // eslint-disable-next-line prefer-const
        let { next, vnode } = instance;
        if (!next) {
          next = vnode;
        }
        // 新的vnode
        const nextTree = renderComponentRoot(instance);
        // 旧的vnode
        const prevTree = instance.subTree;
        instance.subTree = nextTree;
        patch(prevTree, nextTree, container, anchor);
        // 更新组件的dom元素
        next.el = nextTree.el;
      }
    };
    // 创建响应式effect
    // 包装带有调度器scheduler的componentUpdateFn
    const effect = (instance.effect = new ReactiveEffect(componentUpdateFn, () =>
      queuePreFlushCb(update)
    ));
    const update = (instance.update = () => effect.run());
    //update执行之后，此时的activeEffect 指向 effect
    update();
  };
  const patchElement = (oldVNode: VNode, newVNode: VNode) => {
    const el = (newVNode.el = oldVNode.el!);
    const oldProps = oldVNode.props || EMPTY_OBJ;
    const newProps = newVNode.props || EMPTY_OBJ;
    // 更新 props
    patchProps(el, newVNode, oldProps, newProps);
    // 更新 children
    patchChildren(oldVNode, newVNode, el, null);
  };
  const patchProps = (
    el: Element,
    newVNode: VNode,
    oldProps: Record<string, any>,
    newProps: Record<string, any>
  ) => {
    if (oldProps !== newProps) {
      for (const key in newProps) {
        const next = newProps[key];
        const prev = oldProps[key];
        // 添加或更新props
        if (next !== prev) {
          patchProp(el, key, prev, next);
        }
      }
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!(key in newProps)) {
            // 删除旧的props
            patchProp(el, key, oldProps[key], null);
          }
        }
      }
    }
  };
  const patchChildren = (
    oldVNode: VNode,
    newVNode: VNode,
    el: Element,
    anchor?: Element | null
  ) => {
    const oldShapeFlag = oldVNode.shapeFlag || 0;
    const oldChildren = oldVNode.children;
    const newChildren = newVNode.children;
    const newShapeFlag = newVNode.shapeFlag || 0;
    // 新子节点是文本
    if (newShapeFlag & ShapeFlags.TEXT_CHILDREN) {
      if (oldShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // TODO 卸载旧的子节点
      }
      if (oldChildren !== newChildren) {
        // 设置文本
        setElementText(el, newChildren);
      }
    } else {
      // 旧子节点是数组
      if (oldShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // diff算法
        patchKeyedChildren(oldChildren, newChildren, el, anchor);
      } else {
        // 旧子节点是文本
        if (oldShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          setElementText(el, '');
        }
      }
    }
  };
  const patchKeyedChildren = (
    oldChildren: any[],
    newChildren: any[],
    container: Element,
    parentAnchor?: Element | null
  ) => {
    let i = 0;
    const oldLen = oldChildren.length;
    const newLen = newChildren.length;
    let oldEnd = oldLen - 1;
    let newEnd = newLen - 1;
    // 从头同步
    while (i <= oldEnd && i <= newEnd) {
      const oldVNode = (oldChildren[i] = normalizeVNode(oldChildren[i]));
      const newVNode = (newChildren[i] = normalizeVNode(newChildren[i]));

      if (isSameVNodeType(oldVNode, newVNode)) {
        patch(oldVNode, newVNode, container);
      } else {
        break;
      }
      i++;
    }

    // 从尾同步
    while (i <= oldEnd && i <= newEnd) {
      const oldVNode = (oldChildren[oldEnd] = normalizeVNode(oldChildren[oldEnd]));
      const newVNode = (newChildren[newEnd] = normalizeVNode(newChildren[newEnd]));
      if (isSameVNodeType(oldVNode, newVNode)) {
        patch(oldVNode, newVNode, container);
      } else {
        break;
      }
      oldEnd--;
      newEnd--;
    }

    console.log('oldEnd', oldEnd);
    console.log('newEnd', newEnd);
    console.log('i', i);

    if (i > oldEnd) {
      // 新节点多于旧节点（挂载）
      // 此时 oldEnd = -1
      if (i <= newEnd) {
        const anchor = newEnd + 1 < newLen ? newChildren[newEnd + 1].el : null;
        while (i <= newEnd) {
          patch(null, (newChildren[i] = normalizeVNode(newChildren[i])), container, anchor);
          i++;
        }
      }
    } else if (i > newEnd) {
      // 旧节点多于新节点（卸载）
      // 此时 newEnd = -1
      while (i <= oldEnd) {
        unmount(oldChildren[i]);
        i++;
      }
    } // 5. 乱序的 diff 比对
    else {
      // 旧子节点的开始索引：oldChildrenStart
      const oldStartIndex = i;
      // 新子节点的开始索引：newChildrenStart
      const newStartIndex = i;
      // 5.1 创建一个 <key（新节点的 key）:index（新节点的位置）> 的 Map 对象 keyToNewIndexMap。通过该对象可知：新的 child（根据 key 判断指定 child） 更新后的位置（根据对应的 index 判断）在哪里
      const keyToNewIndexMap = new Map();
      // 通过循环为 keyToNewIndexMap 填充值（s2 = newChildrenStart; e2 = newEnd）
      for (i = newStartIndex; i <= newEnd; i++) {
        // 从 newChildren 中根据开始索引获取每一个 child（c2 = newChildren）
        const nextChild = normalizeVNode(newChildren[i]);
        // child 必须存在 key（这也是为什么 v-for 必须要有 key 的原因）
        if (nextChild.key != null) {
          // 把 key 和 对应的索引，放到 keyToNewIndexMap 对象中
          keyToNewIndexMap.set(nextChild.key, i);
        }
      }

      // 5.2 循环 oldChildren ，并尝试进行 patch（打补丁）或 unmount（删除）旧节点
      let j;
      // 记录已经修复的新节点数量
      let patched = 0;
      // 新节点待修补的数量 = newEnd - newChildrenStart + 1
      const toBePatched = newEnd - newStartIndex + 1;
      // 标记位：节点是否需要移动
      let moved = false;
      // 配合 moved 进行使用，它始终保存当前最大的 index 值
      let maxNewIndexSoFar = 0;
      // 创建一个 Array 的对象，用来确定最长递增子序列。它的下标表示：《新节点的下标（newIndex），不计算已处理的节点。即：n-c 被认为是 0》，元素表示：《对应旧节点的下标（oldIndex），永远 +1》
      // 但是，需要特别注意的是：oldIndex 的值应该永远 +1 （ 因为 0 代表了特殊含义，他表示《新节点没有找到对应的旧节点，此时需要新增新节点》）。即：旧节点下标为 0， 但是记录时会被记录为 1
      const newIndexToOldIndexMap = new Array(toBePatched);
      // 遍历 toBePatched ，为 newIndexToOldIndexMap 进行初始化，初始化时，所有的元素为 0
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;
      // 遍历 oldChildren（s1 = oldChildrenStart; e1 = oldEnd），获取旧节点，如果当前 已经处理的节点数量 > 待处理的节点数量，那么就证明：《所有的节点都已经更新完成，剩余的旧节点全部删除即可》
      for (i = oldStartIndex; i <= oldEnd; i++) {
        // 获取旧节点
        const prevChild = oldChildren[i];
        // 如果当前 已经处理的节点数量 > 待处理的节点数量，那么就证明：《所有的节点都已经更新完成，剩余的旧节点全部删除即可》
        if (patched >= toBePatched) {
          // 所有的节点都已经更新完成，剩余的旧节点全部删除即可
          unmount(prevChild);
          continue;
        }
        // 新节点需要存在的位置，需要根据旧节点来进行寻找（包含已处理的节点。即：n-c 被认为是 1）
        let newIndex;
        // 旧节点的 key 存在时
        if (prevChild.key != null) {
          // 根据旧节点的 key，从 keyToNewIndexMap 中可以获取到新节点对应的位置
          newIndex = keyToNewIndexMap.get(prevChild.key);
        } else {
          // 旧节点的 key 不存在（无 key 节点）
          // 那么我们就遍历所有的新节点，找到《没有找到对应旧节点的新节点，并且该新节点可以和旧节点匹配》，如果能找到，那么 newIndex = 该新节点索引
          for (j = newStartIndex; j <= newEnd; j++) {
            // 找到《没有找到对应旧节点的新节点，并且该新节点可以和旧节点匹配》
            if (
              newIndexToOldIndexMap[j - newStartIndex] === 0 &&
              isSameVNodeType(prevChild, newChildren[j])
            ) {
              // 如果能找到，那么 newIndex = 该新节点索引
              newIndex = j;
              break;
            }
          }
        }
        // 最终没有找到新节点的索引，则证明：当前旧节点没有对应的新节点
        if (newIndex === undefined) {
          // 此时，直接删除即可
          unmount(prevChild);
        }
        // 没有进入 if，则表示：当前旧节点找到了对应的新节点，那么接下来就是要判断对于该新节点而言，是要 patch（打补丁）还是 move（移动）
        else {
          // 为 newIndexToOldIndexMap 填充值：下标表示：《新节点的下标（newIndex），不计算已处理的节点。即：n-c 被认为是 0》，元素表示：《对应旧节点的下标（oldIndex），永远 +1》
          // 因为 newIndex 包含已处理的节点，所以需要减去 s2（s2 = newChildrenStart）表示：不计算已处理的节点
          newIndexToOldIndexMap[newIndex - newStartIndex] = i + 1;
          // maxNewIndexSoFar 会存储当前最大的 newIndex，它应该是一个递增的，如果没有递增，则证明有节点需要移动
          if (newIndex >= maxNewIndexSoFar) {
            // 持续递增
            maxNewIndexSoFar = newIndex;
          } else {
            // 没有递增，则需要移动，moved = true
            moved = true;
          }
          // 打补丁
          patch(prevChild, newChildren[newIndex], container, null);
          // 自增已处理的节点数量
          patched++;
        }
      }

      // 5.3 针对移动和挂载的处理
      // 仅当节点需要移动的时候，我们才需要生成最长递增子序列，否则只需要有一个空数组即可
      const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : [];
      // j >= 0 表示：初始值为 最长递增子序列的最后下标
      // j < 0 表示：《不存在》最长递增子序列。
      j = increasingNewIndexSequence.length - 1;
      // 倒序循环，以便我们可以使用最后修补的节点作为锚点
      for (i = toBePatched - 1; i >= 0; i--) {
        // nextIndex（需要更新的新节点下标） = newChildrenStart + i
        const nextIndex = newStartIndex + i;
        // 根据 nextIndex 拿到要处理的 新节点
        const nextChild = newChildren[nextIndex];
        // 获取锚点（是否超过了最长长度）
        const anchor = nextIndex + 1 < newLen ? newChildren[nextIndex + 1].el : parentAnchor;
        // 如果 newIndexToOldIndexMap 中保存的 value = 0，则表示：新节点没有用对应的旧节点，此时需要挂载新节点
        if (newIndexToOldIndexMap[i] === 0) {
          // 挂载新节点
          patch(null, nextChild, container, anchor);
        }
        // moved 为 true，表示需要移动
        else if (moved) {
          // j < 0 表示：不存在 最长递增子序列
          // i !== increasingNewIndexSequence[j] 表示：当前节点不在最后位置
          // 那么此时就需要 move （移动）
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor);
          } else {
            // j 随着循环递减
            j--;
          }
        }
      }
    }
  };
  /**
   * 移动节点到指定位置
   */
  const move = (vnode: VNode, container: Element, anchor: Element | null) => {
    const { el } = vnode;
    insert(el!, container, anchor);
  };
  const unmount = (vnode: VNode) => {
    remove(vnode.el!);
  };
  const patch = (
    oldVNode: VNode | null,
    newVNode: VNode,
    container: Element,
    anchor?: Element | null
  ) => {
    if (oldVNode === newVNode) {
      return;
    }
    // 元素类型不同，删除旧节点，再挂载新节点
    if (oldVNode && !isSameVNodeType(oldVNode, newVNode)) {
      unmount(oldVNode);
      oldVNode = null;
    }
    const { shapeFlag, type } = newVNode;
    switch (type) {
      case Text:
        processText(oldVNode, newVNode, container);
        break;
      case Fragment:
        break;
      case Comment:
        break;
      default:
        if (shapeFlag & ShapeFlags.ELEMENT) {
          // 处理元素
          processElement(oldVNode, newVNode, container, anchor);
        } else if (shapeFlag & ShapeFlags.COMPONENT) {
          // 处理组件
          processComponent(oldVNode, newVNode, container, anchor);
        }
    }
  };

  const render = (vnode: VNode | null, container: any) => {
    if (vnode == null) {
      // 卸载逻辑
      if (container._vnode) {
        unmount(container._vnode);
      }
    } else {
      // patch
      patch(container._vnode || null, vnode, container);
    }
    // 每次调用render函数，把container的_vnode指向最新的vnode
    // 保持container的vnode是最新的
    container._vnode = vnode;
  };
  return { render };
}

let renderer: ReturnType<typeof createRenderer> | null = null;

const renderOptions: RendererOptions = extend({ patchProp }, nodeOps);

function ensureRenderer() {
  return renderer || (renderer = createRenderer(renderOptions));
}
export function render(vnode: VNode, container: any) {
  return ensureRenderer().render(vnode, container);
}

function getSequence(arr: number[]): number[] {
  // 获取一个数组浅拷贝。注意 p 的元素改变并不会影响 arr
  // p 是一个最终的回溯数组，它会在最终的 result 回溯中被使用
  // 它会在每次 result 发生变化时，记录 result 更新前最后一个索引的值
  const p = arr.slice();
  // 定义返回值（最长递增子序列下标），因为下标从 0 开始，所以它的初始值为 0
  const result = [0];
  let i, j, u, v, c;
  // 当前数组的长度
  const len = arr.length;
  // 对数组中所有的元素进行 for 循环处理，i = 下标
  for (i = 0; i < len; i++) {
    // 根据下标获取当前对应元素
    const arrI = arr[i];
    //
    if (arrI !== 0) {
      // 获取 result 中的最后一个元素，即：当前 result 中保存的最大值的下标
      j = result[result.length - 1];
      // arr[j] = 当前 result 中所保存的最大值
      // arrI = 当前值
      // 如果 arr[j] < arrI 。那么就证明，当前存在更大的序列，那么该下标就需要被放入到 result 的最后位置
      if (arr[j] < arrI) {
        p[i] = j;
        // 把当前的下标 i 放入到 result 的最后位置
        result.push(i);
        continue;
      }
      // 不满足 arr[j] < arrI 的条件，就证明目前 result 中的最后位置保存着更大的数值的下标。
      // 但是这个下标并不一定是一个递增的序列，比如： [1, 3] 和 [1, 2]
      // 所以我们还需要确定当前的序列是递增的。
      // 计算方式就是通过：二分查找来进行的

      // 初始下标
      u = 0;
      // 最终下标
      v = result.length - 1;
      // 只有初始下标 < 最终下标时才需要计算
      while (u < v) {
        // (u + v) 转化为 32 位 2 进制，右移 1 位 === 取中间位置（向下取整）例如：8 >> 1 = 4;  9 >> 1 = 4; 5 >> 1 = 2
        // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Right_shift
        // c 表示中间位。即：初始下标 + 最终下标 / 2 （向下取整）
        c = (u + v) >> 1;
        // 从 result 中根据 c（中间位），取出中间位的下标。
        // 然后利用中间位的下标，从 arr 中取出对应的值。
        // 即：arr[result[c]] = result 中间位的值
        // 如果：result 中间位的值 < arrI，则 u（初始下标）= 中间位 + 1。即：从中间向右移动一位，作为初始下标。 （下次直接从中间开始，往后计算即可）
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          // 否则，则 v（最终下标） = 中间位。即：下次直接从 0 开始，计算到中间位置 即可。
          v = c;
        }
      }
      // 最终，经过 while 的二分运算可以计算出：目标下标位 u
      // 利用 u 从 result 中获取下标，然后拿到 arr 中对应的值：arr[result[u]]
      // 如果：arr[result[u]] > arrI 的，则证明当前  result 中存在的下标 《不是》 递增序列，则需要进行替换
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }
        // 进行替换，替换为递增序列
        result[u] = i;
      }
    }
  }
  // 重新定义 u。此时：u = result 的长度
  u = result.length;
  // 重新定义 v。此时 v = result 的最后一个元素
  v = result[u - 1];
  // 自后向前处理 result，利用 p 中所保存的索引值，进行最后的一次回溯
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }
  return result;
}
