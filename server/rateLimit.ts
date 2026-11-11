const hits = new Map<string, { count: number; start: number }>();

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

export function resetRateLimits() {
  hits.clear();
}
