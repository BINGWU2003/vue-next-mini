import {
  isString,
  ShapeFlags,
  isArray,
  isObject,
  isFunction,
  normalizeClass,
} from '@vue-next-mini/shared';
export type VNode = {
  __is_VNode: true;
  // 节点类型
  type: any;
  props: any;
  children: any;
  shapeFlag: number;
  el?: Element | null;
  // vnode的key，用于diff算法中优化比对
  key: string | number;
  // 组件实例
  component?: any;
};

export const Text = Symbol('Text');
export const Fragment = Symbol('Fragment');
export const Comment = Symbol('Comment');

export function createVNode(type: any, props: any, children: any): VNode {
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : isObject(type)
      ? ShapeFlags.STATEFUL_COMPONENT
      : 0;
  if (props) {
    if (props.class) {
      // class 增强处理
      props.class = normalizeClass(props.class);
    }
  }
  return createBaseVNode(type, props, children, shapeFlag);
}
export function isVNode(value: any): value is VNode {
  return value && value.__is_VNode;
}

function createBaseVNode(type: any, props: any, children: any, shapeFlag: number): VNode {
  const vnode: VNode = {
    __is_VNode: true,
    type,
    props,
    children,
    shapeFlag,
    key: props && props.key,
  };
  normalizeChildren(vnode, children);
  return vnode;
}

function normalizeChildren(vnode: VNode, children: any) {
  let type = 0;
  if (children == null) {
    vnode.children = null;
  } else if (isArray(children)) {
    type = ShapeFlags.ARRAY_CHILDREN;
    // TODO
  } else if (isObject(children)) {
    // TODO
  } else if (isFunction(children)) {
    // TODO
  } else {
    // children 是 string 或 number
    children = String(children);
    type = ShapeFlags.TEXT_CHILDREN;
  }
  vnode.children = children;
  vnode.shapeFlag |= type;
}

export function isSameVNodeType(n1: VNode, n2: VNode): boolean {
  return n1.type === n2.type && n1.key === n2.key;
}
