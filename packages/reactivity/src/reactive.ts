import { isObject } from '@vue-next-mini/shared';
import { mutableHandlers } from './baseHandlers';

export enum ReactiveFlags {
  IS_REACTIVE = '__v_isReactive',
}

export function createReactiveObject(
  target: object,
  baseHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<object, any>
) {
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const proxy = new Proxy(target, baseHandlers);
  proxy[ReactiveFlags.IS_REACTIVE] = true;
  proxyMap.set(target, proxy);
  return proxy;
}
export const reactiveMap = new WeakMap<object, any>();

export function reactive<T extends object>(target: T) {
  return createReactiveObject(target, mutableHandlers, reactiveMap);
}

export function toReactive(value: any) {
  return isObject(value) ? reactive(value) : value;
}

export function isReactive(value: any): boolean {
  return !!(value && value[ReactiveFlags.IS_REACTIVE]);
}
