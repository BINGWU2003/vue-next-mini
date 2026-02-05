export function patchClass(el: Element, value: string | null) {
  if (value == null) {
    el.removeAttribute('class');
  } else {
    // 使用 className 设置 class 属性
    // 性能更好一些
    el.className = value;
  }
}
