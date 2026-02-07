import { EMPTY_OBJ, extend, ShapeFlags } from '@vue-next-mini/shared';
import { Fragment, isSameVNodeType, Text } from './vnode';
import type { VNode } from './vnode';
import { nodeOps, patchProp } from '@vue-next-mini/runtime-dom';
import { createComponentInstance, setupComponent } from './component';
import { renderComponentRoot } from './componentRenderUtils';
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
      // TODO
    }
    if (props) {
      for (const key in props) {
        const val = props[key];
        patchProp(el, key, null, val);
      }
    }
    insert(el, container, anchor);
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
      } else {
        // 组件
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
    patchChildren(oldVNode, newVNode, el);
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
  const patchChildren = (oldVNode: VNode, newVNode: VNode, el: Element) => {
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
        // TODO
      } else {
        // 旧子节点是文本
        if (oldShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          setElementText(el, '');
        }
      }
    }
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
