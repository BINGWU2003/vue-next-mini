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
