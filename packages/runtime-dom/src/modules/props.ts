export function patchDOMProp(el: any, key: string, value: any) {
  (el as any)[key] = value;
}
