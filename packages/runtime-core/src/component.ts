import { createHookReturn, onBeforeMount, onMounted } from './apiLifecycle';
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
    isMounted: false,
    bm: null,
    m: null,
    bc: null,
    c: null,
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
  const { data: dataOption, beforeCreate, create, mounted, beforeMount } = instance.type;
  if (beforeCreate) {
    callHook(beforeCreate);
  }
  if (dataOption) {
    const dataResult = dataOption();
    if (isObject(dataResult)) {
      instance.data = reactive(dataResult);
    }
  }
  if (create) {
    callHook(create, instance.data);
  }
  function registerLifecycleHook(register: createHookReturn, hook: () => any) {
    // this指向组件实例的data
    register(hook.bind(instance.data), instance);
  }
  // 给instance注册生命周期钩子
  registerLifecycleHook(onBeforeMount, beforeMount);
  registerLifecycleHook(onMounted, mounted);
}

function callHook(hook: (...args: any[]) => any, data?: ReturnType<typeof reactive>) {
  // this指向组件实例的data
  hook.bind(data)();
}

export const enum LifecycleHooks {
  BEFORE_MOUNT = 'bm',
  MOUNTED = 'm',
  BEFORE_CREATE = 'bc',
  CREATE = 'c',
}
