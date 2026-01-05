export function track(target: any, key: string | symbol, receiver: any) {
  console.log('track', target, key, receiver);
}

export function trigger(target: any, key: string | symbol, receiver: any) {
  console.log('trigger', target, key, receiver);
}
