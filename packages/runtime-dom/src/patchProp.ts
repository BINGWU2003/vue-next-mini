import { isOn } from '@vue-next-mini/shared';
import { patchClass } from './modules/class';
import { patchDOMProp } from './modules/props';
import { pathAttr } from './modules/attrs';
import { patchStyle } from './modules/style';
import { patchEvent } from './modules/events';
export function patchProp(el: Element, key: string, prevValue: any, nextValue: any) {
  if (key === 'class') {
    patchClass(el, nextValue);
  } else if (key === 'style') {
    patchStyle(el, prevValue, nextValue);
  } else if (shouldSetAsProp(el, key)) {
    // 作为 DOM Prop 设置
    // 使用 el[key] = value 来设置
    patchDOMProp(el, key, nextValue);
  } else if (isOn(key)) {
    // 事件处理
    patchEvent(el, key, prevValue, nextValue);
  } else {
    // 普通属性
    // 使用 setAttribute 设置属性
    pathAttr(el, key, nextValue);
  }
}

// 决定是否作为 DOM Properties 设置
// input， select，textarea 的某些属性不能作为 DOM Prop 设置
// 使用 el[key] = value 来设置
function shouldSetAsProp(el: Element, key: string): boolean {
  if (
    key === 'form' ||
    (el.tagName === 'INPUT' && key === 'list') ||
    (el.tagName === 'TEXTAREA' && key === 'type')
  ) {
    return false;
  }
  return key in el;
}
