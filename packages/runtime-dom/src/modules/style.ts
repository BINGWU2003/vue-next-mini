import { isString } from '@vue-next-mini/shared';
export function patchStyle(el: Element, pre: any, next: any) {
  const style = (el as HTMLElement).style;

  const isCssString = isString(next);
  if (next && !isCssString) {
    for (const key in next) {
      setStyle(style, key, next[key]);
    }
    if (pre && !isCssString) {
      for (const key in pre) {
        if (next[key] == null) {
          setStyle(style, key, null);
        }
      }
    }
  }
}

function setStyle(style: CSSStyleDeclaration, key: string, value: string | null) {
  if (value == null) {
    style.removeProperty(key);
  } else {
    style.setProperty(key, value);
  }
}
