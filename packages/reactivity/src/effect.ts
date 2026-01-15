import { Dep, createDep } from './dep';

export type EffectScheduler = (...args: any[]) => any;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
/**
 * 当前激活的 effect ，确保 track 的时候知道是哪个 effect 在使用数据
 * */
export let activeEffect: ReactiveEffect | undefined;
export class ReactiveEffect<T = any> {
  // 等价于
  // public fn: () => T;
  // constructor(fn: () => T) {
  //   this.fn = fn;
  // }
  public computed?: any = undefined;
  constructor(
    public fn: () => T,
    public scheduler: EffectScheduler | null = null
  ) {}
  run() {
    console.log('ReactiveEffect', this);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeEffect = this;
    return this.fn();
  }
}

export function effect<T = any>(fn: () => T) {
  const _effect = new ReactiveEffect(fn);
  _effect.run();
}

/**
 * target -> key -> dep
 * 构建依赖关系
 **/
const targetMap = new WeakMap<any, Map<any, Dep>>();

export function track(target: any, key: string | symbol) {
  if (!activeEffect) return;
  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }
  let dep = depsMap.get(key);
  if (!dep) {
    dep = createDep();
    depsMap.set(key, dep);
  }
  trackEffects(dep);
}

/**
 * 追踪依赖集合
 */
export function trackEffects(dep: Dep) {
  if (!activeEffect) {
    return;
  }
  dep.add(activeEffect);
}

export function trigger(target: any, key: string | symbol) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;
  const dep = depsMap.get(key);
  if (!dep) return;
  triggerEffects(dep);
}
/**
 * 触发依赖集合
 */
export function triggerEffects(dep: Dep) {
  // 优先触发计算属性 缓存&解决死循环
  dep.forEach((effect) => {
    if (effect.computed) {
      triggerEffect(effect);
    }
  });
  // 后触发非计算属性
  dep.forEach((effect) => {
    if (!effect.computed) {
      triggerEffect(effect);
    }
  });
}

export function triggerEffect(effect: ReactiveEffect) {
  if (effect.scheduler) {
    effect.scheduler();
  } else {
    effect.run();
  }
}
