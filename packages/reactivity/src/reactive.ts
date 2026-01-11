import { isObject } from '@vue-next-mini/shared';
import { mutableHandlers } from './baseHandlers';

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
