import { isString, ShapeFlags, isArray, isObject, isFunction } from '@vue-next-mini/shared';
export type VNode = {
  __is_VNode: true;
  type: any;
  props: any;
  children: any;
  shapeFlag: number;
};

export function createVNode(type: any, props: any, children: any): VNode {
  const shapeFlag = isString(type) ? ShapeFlags.ELEMENT : 0;
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
