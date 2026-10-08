export function helpfulNamespace<T extends object>(name: string, obj: T): T {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      // ECMAScript probes these properties while awaiting and serializing any
      // object. Their absence is protocol information, not a misspelled API
      // member, so let the language treat this namespace as an ordinary value.
      if (prop === "then" || prop === "toJSON") return undefined;
      const known = Object.keys(target).join(", ");
      throw new TypeError(
        `${name}.${String(prop)} is not available. Known members on ${name}: ${known}. ` +
        "Call `await help()` for the live surface.",
      );
    },
  });
}
