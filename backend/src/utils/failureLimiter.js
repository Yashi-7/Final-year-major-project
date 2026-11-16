/**
 * In-memory limiter for FAILED reference-ID attempts, keyed by farmer id.
 * After `max` failures inside `windowMs` the farmer is blocked until the window ends.
 * Successful lookups are NOT counted and NEVER reset the counter (otherwise a guesser could interleave
 * one valid ID to keep resetting it).
 * State is per server process; with several instances use a shared store (e.g. Redis) instead.
 */
export const createFailureLimiter = ({ max = 8, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) => {
  const entries = new Map(); // key -> { count, resetAt }

  const prune = () => {
    if (entries.size < 5000) return;
    const t = now();
    for (const [k, v] of entries) if (v.resetAt <= t) entries.delete(k);
  };

  const live = (key) => {
    const e = entries.get(key);
    if (e && e.resetAt <= now()) { entries.delete(key); return undefined; }
    return e;
  };

  return {
    check(key) {
      const e = live(key);
      if (e && e.count >= max) return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((e.resetAt - now()) / 1000)) };
      return { blocked: false, retryAfterSeconds: 0 };
    },
    fail(key) {
      prune();
      const e = live(key);
      if (e) e.count += 1; else entries.set(key, { count: 1, resetAt: now() + windowMs });
    },
  };
};
