import { Dep, createDep } from './dep';
import { activeEffect, trackEffects } from './effect';
import { toReactive } from './reactive';
export interface Ref<T = any> {
  value: T;
}

export function ref<T = any>(value: T) {
  return createRef<T>(value);
}

export function createRef<T = any>(value: T, shallow: boolean = false) {
  if (isRef(value)) {
    return value;
  }

  return new RefImpl(value, shallow);
}
/** RefImpl类
 * value 如果是对象类型，底层调用reactive进行响应式转换，本质上是包装了一个reactive对象
 * dep 依赖集合，存储使用该ref的effect
 * 当读取value上的某个属性value.xxx  ==>  先调用trackRefValue()追踪依赖，再调用reactive的get方法追踪依赖
 * 当修改value上的某个属性value.xxx = xxx  ==>  先调用reactive的set方法触发依赖，再调用triggerEffects()触发ref的依赖
 */
export class RefImpl<T = any> {
  private _value: T;
  // 依赖集合
  public dep?: Dep = undefined;
  // 是否是ref标识
  public readonly __v_isRef = true;
  constructor(
    value: T,
    public readonly __v_isShallow: boolean
  ) {
    this._value = __v_isShallow ? value : toReactive(value);
  }
  get value() {
    trackRefValue(this);
    return this._value;
  }
  set value(newVal: T) {
    console.log(newVal);

    // this._value = newVal;
  }
}

export function trackRefValue(ref: RefImpl) {
  if (!activeEffect) {
    return;
  }
  trackEffects(ref.dep || (ref.dep = createDep()));
}
/**
 * 判断是否为ref
 */
export function isRef(r: any) {
  return !!(r && r.__v_isRef === true);
}
