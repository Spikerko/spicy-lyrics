export function html(strings: TemplateStringsArray, ...values: any[]) {
  return String.raw({ raw: strings }, ...values);
}