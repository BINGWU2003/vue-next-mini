// 当前激活的 effect ，确保 track 的时候知道是哪个 effect 在使用数据
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export let activeEffect: ReactiveEffect | undefined;
export class ReactiveEffect<T = any> {
  // 等价于
  // public fn: () => T;
  // constructor(fn: () => T) {
  //   this.fn = fn;
  // }
  constructor(public fn: () => T) {}
  run() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeEffect = this;
    return this.fn();
  }
}

export function effect<T = any>(fn: () => T) {
  const _effect = new ReactiveEffect(fn);
  _effect.run();
}

// target -> key -> dep
// 构建依赖关系
const targetMap = new WeakMap<any, Map<any, ReactiveEffect>>();

export function track(target: any, key: string | symbol) {
  if (!activeEffect) return;
  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }
  depsMap.set(key, activeEffect);
}

export function trigger(target: any, key: string | symbol) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;
  const effect = depsMap.get(key);
  if (!effect) return;
  effect.run();
}
