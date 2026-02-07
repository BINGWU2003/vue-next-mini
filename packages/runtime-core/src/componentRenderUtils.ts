import { ShapeFlags } from '@vue-next-mini/shared';
import { createVNode, Text } from './vnode';

/**
 * 处理组件的 render 函数的返回值
  const instance = {
    vnode: { shapeFlag: ShapeFlags.STATEFUL_COMPONENT },
    data: reactive({ msg: 'hello' }),
    render(this: any) {
      // 可以用 this.msg 或 ctx.msg 访问数据
      return h('div', this.msg.toUpperCase());
    }
  };
  const vnode = renderComponentRoot(instance);
  vnode 相当于 createVNode('div', null, 'HELLO')
 */
export function renderComponentRoot(instance: any) {
  const { vnode, render, data = {} } = instance;

  let result;
  try {
    // 解析到状态组件
    if (vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
      // 获取到 result 返回值，如果 render 中使用了 this，则需要修改 this 指向
      /**
       * const component = {
        name: 'MyComponent',
        data() {
          return {
            msg: 'hello data from component',
          };
        },
        render() {
          return h('div', this.msg);
        },
      };
       */
      // 此时的data已是响应式数据
      // 如果render函数读取了响应式数据，此时render函数的执行会触发依赖收集(getter)
      // effect 为 包装之后带有调度器scheduler的componentUpdateFn
      result = normalizeVNode(render!.call(data));
    }
  } catch (err) {
    console.error(err);
  }

  return result;
}

/**
 * 标准化 VNode
 */
export function normalizeVNode(child: any) {
  if (typeof child === 'object') {
    return cloneIfMounted(child);
  } else {
    return createVNode(Text, null, String(child));
  }
}

/**
 * clone VNode
 */
export function cloneIfMounted(child: any) {
  return child;
}
