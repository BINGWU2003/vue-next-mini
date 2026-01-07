import { track, trigger } from './effect';

// 重写get和set方法
// 通过Reflect来修改target中getter和setter的this指向，使其指向receiver(proxy对象)
export function createGetter() {
  return function get(target: any, key: string | symbol, receiver: any) {
    const res = Reflect.get(target, key, receiver);
    track(target, key);
    return res;
  };
}

export function createSetter() {
  return function set(target: any, key: string | symbol, value: any, receiver: any) {
    // 必须使用Reflect.set来设置属性值，从而保证trigger中的target和key正确
    const res = Reflect.set(target, key, value, receiver);

    trigger(target, key);

    return res;
  };
}

const get = createGetter();
const set = createSetter();
export const mutableHandlers: ProxyHandler<any> = {
  get,
  set,
};
