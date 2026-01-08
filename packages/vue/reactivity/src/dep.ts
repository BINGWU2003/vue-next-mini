import { ReactiveEffect } from './effect';
export type Dep = Set<ReactiveEffect>;
// 构建依赖集合
export function createDep(effects?: ReactiveEffect[]) {
  return new Set<ReactiveEffect>(effects);
}
