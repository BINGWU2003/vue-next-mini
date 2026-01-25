import { isString, isArray, isObject } from '@vue-next-mini/shared';

export function normalizeClass(value: any): string {
  let res = '';

  if (isString(value)) {
    // {class: 'my-color'}
    return value;
  } else if (isArray(value)) {
    // {class: ['my-color', 'your-color',['her-color']]}
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + ' ';
      }
    }
  } else if (isObject(value)) {
    // {class: { 'my-color': true, 'your-color': false, 'her-color': 1 }}
    for (const name in value) {
      if ((value as Record<string, any>)[name]) {
        res += name + ' ';
      }
    }
  }

  return res.trim();
}
