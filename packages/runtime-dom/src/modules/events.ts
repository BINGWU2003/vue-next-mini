/**
 *
 * @param el
 * @param rawName 事件名称，如 onClick
 * @param preValue
 * @param nextValue
 */
export function patchEvent(
  el: Element & { _vei?: Record<string, any> },
  rawName: string,
  preValue: any,
  nextValue: any
) {
  // 剔除 on 前缀，得到事件名称，如 click
  const name = rawName.slice(2).toLowerCase();
  const invokers = el._vei || (el._vei = {});
  const existingInvoker = invokers[rawName];
  if (nextValue && existingInvoker) {
    // 更新缓存的事件处理函数
    existingInvoker.value = nextValue;
  } else {
    if (nextValue) {
      // 添加事件
      const invoker = (invokers[rawName] = createInvoker(nextValue));
      el.addEventListener(name, invoker);
    } else if (existingInvoker) {
      // 元素上存在该事件，但新的事件处理函数不存在
      // {onClick: () => {...}}   ->     {}
      // 移除事件
      el.removeEventListener(name, existingInvoker);
      invokers[rawName] = undefined;
    }
  }
}

function createInvoker(initValue: () => void) {
  const invoker = () => {
    // 执行最新的事件处理函数
    invoker.value();
  };

  invoker.value = initValue;
  return invoker;
}
