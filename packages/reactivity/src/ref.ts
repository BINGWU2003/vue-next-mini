import { Dep, createDep } from './dep';
import { activeEffect, trackEffects, triggerEffects } from './effect';
import { toReactive } from './reactive';
import { hasChanged } from '@vue-next-mini/shared';
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
 * dep 依赖集合，存储使用该ref的effect
 *
 * value 如果是复杂数据类型，底层调用reactive进行响应式转换，本质上是包装了一个reactive对象
 * 当读取value上的某个属性value.xxx  ==>  调用reactive的get方法追踪依赖，构成依赖关系
 * 当修改value上的某个属性value.xxx = xxx  ==>  调用reactive的set方法触发依赖
 *
 * value 如果是简单数据类型，直接存储该值
 * 当读取value  ==>  直接调用trackRefValue()追踪依赖，将依赖储存到dep中
 * 当修改value  ==>  直接调用triggerRefValue()触发依赖
 */
export class RefImpl<T = any> {
  private _rawValue: T;
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
    this._rawValue = value;
  }
  get value() {
    // trackRefValue 负责“对象整体替换”的响应式追踪以及“简单数据类型”的响应式追踪
    trackRefValue(this);
    return this._value;
  }
  set value(newVal: T) {
    // 判断新值和旧值是否发生变化
    // 简单数据类型，直接对比
    // 引用数据类型，比较引用地址 也解决了直接赋值新对象的问题
    // 例如：
    // const state = ref({
    //   name: 'John',
    //   age: 18,
    // });
    //state.value = { name: 'Mary', age: 100 }; // 直接赋值新对象，引用地址发生变化，视为数据变化

    // 使用_rawValue而不是_value进行比较，是因为_value是响应式对象，可能存在嵌套对象，导致比较不准确
    if (hasChanged(newVal, this._rawValue)) {
      this._rawValue = newVal;
      this._value = toReactive(newVal);
      triggerRefValue(this);
    }
  }
}

export function triggerRefValue(ref: RefImpl) {
  if (ref.dep) {
    triggerEffects(ref.dep);
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
