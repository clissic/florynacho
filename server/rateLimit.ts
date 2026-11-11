const hits = new Map<string, { count: number; start: number }>();

const LOGIN_CAPACITY = 10;
const LOGIN_REFILL_MS = 10_000;
const loginBuckets = new Map<string, { tokens: number; updatedAt: number }>();

export function consumeRateLimit(token: string, max = 30, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const current = hits.get(token);
  if (!current || now - current.start > windowMs) {
    hits.set(token, { count: 1, start: now });
    return true;
  }
  if (current.count >= max) return false;
  current.count += 1;
  return true;
}

/** Bucket de login: hasta 10 intentos, se recarga 1 cada 10 segundos. */
export function consumeLoginAttempt(key: string, now = Date.now()) {
  let bucket = loginBuckets.get(key);
  if (!bucket) {
    bucket = { tokens: LOGIN_CAPACITY, updatedAt: now };
    loginBuckets.set(key, bucket);
  }

  const elapsed = Math.max(0, now - bucket.updatedAt);
  const refilled = Math.floor(elapsed / LOGIN_REFILL_MS);
  if (refilled > 0) {
    bucket.tokens = Math.min(LOGIN_CAPACITY, bucket.tokens + refilled);
    bucket.updatedAt += refilled * LOGIN_REFILL_MS;
  }

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function resetRateLimits() {
  hits.clear();
  loginBuckets.clear();
}
