import { isFunction } from '@vue-next-mini/shared';
import { Dep } from './dep';
import { ReactiveEffect } from './effect';
import { trackRefValue, triggerRefValue } from './ref';
class ComputedRefImpl<T> {
  private _value!: T;
  public dep?: Dep = undefined;
  public readonly __v_isRef = true;
  // 标记脏值，默认值为true，表示需要计算 为false表示需要触发依赖更新
  public _dirty = true;
  // effect为computed依赖的函数
  public readonly effect: ReactiveEffect<T>;
  constructor(getter: any) {
    // 此时activeEffect指向this.effect
    // this.effect.fn = getter
    this.effect = new ReactiveEffect(getter, () => {
      // 当computed依赖的响应式数据变化时，执行调度函数
      if (!this._dirty) {
        this._dirty = true;

        triggerRefValue(this as any);
      }
    });

    this.effect.computed = this;
  }

  get value() {
    trackRefValue(this as any);
    if (this._dirty) {
      this._dirty = false;
      // 被动调用effect.run()，从而调用getter获取最新值
      this._value = this.effect.run();
    }
    return this._value;
  }
}

export function computed<T>(getterOrOptions: any) {
  let getter = null;
  const onlyGetter = isFunction(getterOrOptions);
  if (onlyGetter) {
    getter = getterOrOptions;
  }
  const computedRef = new ComputedRefImpl<T>(getter!);

  return computedRef;
}
