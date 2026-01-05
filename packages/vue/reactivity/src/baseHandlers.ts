import { track, trigger } from './effect';

// 重写get和set方法
// 通过Reflect来修改target中getter和setter的this指向，使其指向receiver(proxy对象)
export function createGetter() {
  return function get(target: any, key: string | symbol, receiver: any) {
    track(target, key, receiver);
    return Reflect.get(target, key, receiver);
  };
}

export function createSetter() {
  return function set(target: any, key: string | symbol, value: any, receiver: any) {
    const result = Reflect.set(target, key, value, receiver);
    trigger(target, key, receiver);
    return result;
  };
}

const get = createGetter();
const set = createSetter();
export const mutableHandlers: ProxyHandler<any> = {
  get,
  set,
};
