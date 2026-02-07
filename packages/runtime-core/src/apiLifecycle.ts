import { LifecycleHooks } from './component';

// 注入生命周期钩子
export function injectHook(type: LifecycleHooks, hook: () => any, target: any) {
  if (target) {
    target[type] = hook;
    return hook;
  }
}

export function createHook(type: LifecycleHooks) {
  return (hook: () => any, target: any) => injectHook(type, hook, target);
}
export type createHookReturn = ReturnType<typeof createHook>;
export const onBeforeMount = createHook(LifecycleHooks.BEFORE_MOUNT);

export const onMounted = createHook(LifecycleHooks.MOUNTED);
