import { isOn } from '@vue-next-mini/shared';
import { patchClass } from './modules/class';
export function patchProp(el: Element, key: string, prevValue: any, nextValue: any) {
  if (key === 'class') {
    patchClass(el, nextValue);
  } else if (key === 'style') {
    // TODO
  } else if (isOn(key)) {
    // TODO
  } else {
    // 普通属性
  }
}
