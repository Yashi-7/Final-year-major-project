// Tiny evaluator for the query operators the government claim queries use: $or, $and, dotted-path equality,
// {$regex,$options:'i'} and {$gte,$lte} on dates. Test support code (not production): it lets tests check what a filter
// would match without MongoDB. Anything else throws, so an unexpected operator in a filter fails a test loudly.
const get = (doc, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
const isOps = (c) => c !== null && typeof c === 'object' && !(c instanceof Date) && Object.keys(c).length > 0 && Object.keys(c).every((k) => k.startsWith('$'));

const matchesOps = (value, ops) =>
  Object.entries(ops).every(([op, arg]) => {
    if (op === '$regex') {
      if (typeof value !== 'string') return false;
      const flags = ops.$options || '';
      if (!/^[i]?$/.test(flags)) throw new Error(`unsupported regex options ${flags}`);
      return new RegExp(arg, flags).test(value);
    }
    if (op === '$options') return true;
    if (op === '$gte') return value != null && new Date(value) >= new Date(arg);
    if (op === '$lte') return value != null && new Date(value) <= new Date(arg);
    throw new Error(`unsupported operator ${op}`);
  });

export const matches = (doc, filter) => {
  if (filter === null || typeof filter !== 'object') return false;
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return Array.isArray(cond) && cond.some((f) => matches(doc, f));
    if (key === '$and') return Array.isArray(cond) && cond.every((f) => matches(doc, f));
    if (key.startsWith('$')) throw new Error(`unsupported operator ${key}`);
    if (isOps(cond)) return matchesOps(get(doc, key), cond);
    if (cond !== null && typeof cond === 'object') throw new Error(`unsupported condition on ${key} (operators are not allowed)`);
    return get(doc, key) === cond;
  });
};
