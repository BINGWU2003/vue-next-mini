import { formatDate } from '@vue-next-mini/shared';
function add(a: number, b: number) {
  console.log(formatDate(new Date()));
  return a + b;
}

export { add };
