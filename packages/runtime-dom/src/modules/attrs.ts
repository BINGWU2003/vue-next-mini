export function pathAttr(el: Element, key: string, value: string | null) {
  if (value == null) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, value);
  }
}
