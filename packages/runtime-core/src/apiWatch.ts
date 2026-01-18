import { isReactive, ReactiveEffect } from '@vue-next-mini/reactivity';
import { hasChanged, isFunction, isObject } from '@vue-next-mini/shared';
import { queuePreFlushCb } from './scheduler';
export type WatchOptions = {
  immediate?: boolean;
  // 是否深度监听
  deep?: boolean;
};

export function watch<T = unknown>(
  source: T,
  cb?: (newVal: T, oldVal: T) => void,
  watchOptions?: WatchOptions
) {
  return doWatch<T>(source, cb, watchOptions);
}

function doWatch<T>(
  source: T,
  cb?: (newVal: T, oldVal: T) => void,
  { immediate, deep }: WatchOptions = {}
) {
  let getter: () => any;
  console.log(source);

  if (isReactive(source)) {
    getter = () => source;
    deep = true;
  } else if (isFunction(source)) {
    // source 是 getter 函数，直接使用
    getter = source as () => any;
  } else {
    // 未实现
    // 其他类型的 source 处理（普通值）
    // 将普通值包装成 getter 函数
    getter = () => source;
  }
  console.log(getter);

  if (cb && deep) {
    const baseGetter = getter;
    getter = () => {
      return traverse(baseGetter());
    };
  }

  let oldValue: any;

  const job = () => {
    if (cb) {
      const newValue = effect.run();
      if (deep || hasChanged(newValue, oldValue)) {
        cb(newValue, oldValue);
        oldValue = newValue;
      }
    }
  };

  const scheduler = () => queuePreFlushCb(job);

  const effect = new ReactiveEffect(getter, scheduler);

  if (cb) {
    if (immediate) {
      job();
    } else {
      // 执行getter，拿到旧值
      // 此时activeEffect指向effect
      oldValue = effect.run();
    }
  } else {
    effect.run();
  }

  // 返回一个停止监听的函数
  // 暂时不实现
  return { stop() {} };
}
// 深度遍历对象的每个属性，进行依赖收集
function traverse(value: any) {
  if (!isObject(value)) return value;
  const val = value as Record<string, any>;
  for (const key in val) {
    traverse(val[key]);
  }
  return value;
}
