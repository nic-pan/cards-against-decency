/** Token bucket. `capacity` actions at once, then `refillPerSec` actions each second. */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();

  constructor(private readonly capacity: number, private readonly refillPerSec: number) {
    this.tokens = capacity;
  }

  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Counts events for each key in a fixed time window. */
export class WindowCounter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  /** Returns false when the key is over the limit. */
  hit(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  /** True when the key is over the limit. Does not count a new event. */
  blocked(key: string): boolean {
    const entry = this.hits.get(key);
    return !!entry && entry.resetAt > Date.now() && entry.count >= this.limit;
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
