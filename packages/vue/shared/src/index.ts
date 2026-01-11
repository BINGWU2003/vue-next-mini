import { add } from '@vue-next-mini/reactivity';
/**
 * 格式化日期
 */
export function formatDate(date: Date): string {
  add(1, 2);
  return date.toLocaleDateString('zh-CN');
}

/**
 * 延迟函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 生成随机ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * 判断是否为一个数组
 */
export const isArray = Array.isArray;

/**
 * 判断是否为一个对象
 */
export const isObject = (val: unknown) => val !== null && typeof val === 'object';

/**
 * 对比两个数据是否发生了改变
 */
export const hasChanged = (value: any, oldValue: any): boolean => !Object.is(value, oldValue);

/**
 * 是否为一个 function
 */
export const isFunction = (val: unknown): val is (...args: any[]) => any =>
  typeof val === 'function';
