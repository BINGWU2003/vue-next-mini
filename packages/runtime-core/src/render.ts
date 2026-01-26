import { extend, ShapeFlags } from '@vue-next-mini/shared';
import { Fragment, Text } from './vnode';
import type { VNode } from './vnode';
import { nodeOps, patchProp } from '@vue-next-mini/runtime-dom';
export type RendererOptions = {
  // 为element的prop打补丁
  patchProp(el: Element, key: string, prevValue: any, nextValue: any): void;
  // 为element设置text
  setElementText(el: Element, text: string): void;
  // 在parent中插入el，参考anchor的位置
  insert(el: Element, parent: Element, anchor?: Element | null): void;
  // 创建element
  createElement(type: string): Element;
};

export function createRenderer(options: RendererOptions) {
  return baseCreateRenderer(options);
}

function baseCreateRenderer(options: RendererOptions) {
  const { patchProp, setElementText, insert, createElement } = options;

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
  const patch = (oldVNode: VNode, newVNode: VNode, container: Element, anchor?: Element | null) => {
    if (oldVNode === newVNode) {
      return;
    }
    const { shapeFlag, type } = newVNode;
    switch (type) {
      case Text:
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
        }
    }
  };

  const render = (vnode: VNode, container: any) => {
    if (vnode == null) {
      // 卸载逻辑
    } else {
      // patch
      patch(container._vnode || null, vnode, container);
    }
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
