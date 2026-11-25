/** Exact equality for closed native JSON wire values, without invoking getters.
 * RPC schemas own the value shape. Prototypes are not JSON data: ordinary records
 * from another realm are valid, while class instances, accessors and cycles are not.
 */
export function nativeWireEqual(left: unknown, right: unknown): boolean {
  const leftPath = new WeakSet<object>(), rightPath = new WeakSet<object>();
  const plain = (value: object): boolean => {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null) return true;
    if (Object.getPrototypeOf(prototype) !== null) return false;
    const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor");
    return !!constructor && "value" in constructor && typeof constructor.value === "function" &&
      /^function\s+Object\(\)\s*\{\s*\[native code\]\s*\}$/u.test(Function.prototype.toString.call(constructor.value));
  };
  const ordinaryArray = (value: object): boolean => {
    const prototype = Object.getPrototypeOf(value);
    if (!prototype || !Array.isArray(prototype)) return false;
    const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor");
    return !!constructor && "value" in constructor && typeof constructor.value === "function" &&
      /^function\s+Array\(\)\s*\{\s*\[native code\]\s*\}$/u.test(Function.prototype.toString.call(constructor.value));
  };
  const compare = (a: unknown, b: unknown): boolean => {
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") {
      if (typeof a === "number") return Number.isFinite(a) && Number.isFinite(b) && Object.is(a,b);
      return (typeof a === "string" || typeof a === "boolean") && a === b;
    }
    const first = a as object, second = b as object;
    const array = Array.isArray(first);
    if (array !== Array.isArray(second) || (array && (!ordinaryArray(first) || !ordinaryArray(second))) || (!array && (!plain(first) || !plain(second))) || leftPath.has(first) || rightPath.has(second)) return false;
    const x = Object.getOwnPropertyDescriptors(first), y = Object.getOwnPropertyDescriptors(second);
    const xKeys = Reflect.ownKeys(x), yKeys = Reflect.ownKeys(y);
    if (xKeys.length !== yKeys.length || xKeys.some(key => typeof key !== "string") || yKeys.some(key => typeof key !== "string")) return false;
    if (array && (x.length?.value !== y.length?.value || xKeys.length !== x.length!.value + 1)) return false;
    leftPath.add(first); rightPath.add(second);
    try {
      for (const key of xKeys as string[]) {
        if (array && key === "length") continue;
        if (array && (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= x.length!.value)) return false;
        const one = x[key], two = y[key];
        if (!one || !two || !one.enumerable || !two.enumerable || !("value" in one) || !("value" in two) || !compare(one.value, two.value)) return false;
      }
      return true;
    } finally { leftPath.delete(first); rightPath.delete(second); }
  };
  return compare(left,right);
}
