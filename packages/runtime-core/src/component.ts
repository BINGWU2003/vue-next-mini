import { reactive } from '@vue-next-mini/reactivity';
import { VNode } from './vnode';
import { generateId, isObject } from '@vue-next-mini/shared';
export function createComponentInstance(vnode: VNode) {
  const type = vnode.type;
  const instance = {
    vnode,
    type,
    uid: generateId(),
    subTree: null,
    effect: null,
    update: null,
    render: null,
  };
  return instance;
}

// 绑定组件实例的 render 函数
export function setupComponent(instance: any) {
  const Component = instance.type;
  // 获取组件的 render 函数
  // component = { render: () => h('div', 'hello world') }
  instance.render = Component.render;
  // 处理组件的 options 数据
  applyOptions(instance);
}

function applyOptions(instance: any) {
  const options = instance.type;
  if (options.data) {
    const data = options.data();
    if (isObject(data)) {
      instance.data = reactive(data);
    }
  }
}
