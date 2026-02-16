/**
 * @corvid-agent/throttle
 *
 * Rate limiter, throttle, and debounce utilities.
 * Zero dependencies. TypeScript-first.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ThrottleOptions {
  /** Execute on the leading edge (default: true) */
  leading?: boolean;
  /** Execute on the trailing edge (default: true) */
  trailing?: boolean;
}

export interface DebounceOptions {
  /** Execute on the leading edge instead of trailing (default: false) */
  leading?: boolean;
  /** Maximum time to wait before forced execution (default: none) */
  maxWait?: number;
}

export interface RateLimiterOptions {
  /** Maximum number of calls allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  window: number;
  /** Strategy when limit is reached (default: "drop") */
  strategy?: "drop" | "queue" | "error";
}

export interface ThrottledFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  /** Cancel any pending trailing call */
  cancel(): void;
  /** Flush: execute any pending call immediately */
  flush(): void;
  /** Whether there's a pending call */
  readonly pending: boolean;
}

export interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  /** Cancel pending call */
  cancel(): void;
  /** Flush: execute pending call immediately */
  flush(): void;
  /** Whether there's a pending call */
  readonly pending: boolean;
}

// ── Errors ─────────────────────────────────────────────────────────────

export class RateLimitError extends Error {
  readonly limit: number;
  readonly window: number;

  constructor(limit: number, window: number) {
    super(`Rate limit exceeded: ${limit} calls per ${window}ms`);
    this.name = "RateLimitError";
    this.limit = limit;
    this.window = window;
  }
}

// ── Throttle ───────────────────────────────────────────────────────────

/**
 * Throttle a function to execute at most once per `wait` ms.
 *
 * @example
 * ```ts
 * import { throttle } from "@corvid-agent/throttle";
 *
 * const throttled = throttle(handleScroll, 200);
 * window.addEventListener("scroll", throttled);
 *
 * // Later:
 * throttled.cancel();
 * ```
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
  options: ThrottleOptions = {},
): ThrottledFunction<T> {
  const { leading = true, trailing = true } = options;
  let lastCallTime: number | undefined;
  let lastExecTime = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;
  let isPending = false;

  function execute(args: Parameters<T>): ReturnType<T> | undefined {
    lastExecTime = Date.now();
    isPending = false;
    return fn(...args);
  }

  const throttled = function (...args: Parameters<T>): ReturnType<T> | undefined {
    const now = Date.now();
    const elapsed = now - lastExecTime;
    lastArgs = args;
    lastCallTime = now;

    if (elapsed >= wait) {
      // Enough time has passed
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (leading) {
        return execute(args);
      }
    }

    // Schedule trailing call
    if (trailing && !timer) {
      isPending = true;
      const remaining = wait - elapsed;
      timer = setTimeout(() => {
        timer = undefined;
        if (trailing && lastArgs) {
          execute(lastArgs);
          lastArgs = undefined;
        }
      }, remaining);
    }

    return undefined;
  } as ThrottledFunction<T>;

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    lastArgs = undefined;
    isPending = false;
  };

  throttled.flush = () => {
    if (timer && lastArgs) {
      clearTimeout(timer);
      timer = undefined;
      execute(lastArgs);
      lastArgs = undefined;
    }
  };

  Object.defineProperty(throttled, "pending", {
    get: () => isPending,
  });

  return throttled;
}

// ── Debounce ───────────────────────────────────────────────────────────

/**
 * Debounce a function — only execute after calls stop for `wait` ms.
 *
 * @example
 * ```ts
 * import { debounce } from "@corvid-agent/throttle";
 *
 * const search = debounce(async (query: string) => {
 *   const results = await fetchResults(query);
 *   render(results);
 * }, 300);
 *
 * input.addEventListener("input", (e) => search(e.target.value));
 * ```
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
  options: DebounceOptions = {},
): DebouncedFunction<T> {
  const { leading = false, maxWait } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;
  let isPending = false;
  let leadingCalled = false;

  function execute(): void {
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = undefined;
    }
    isPending = false;
    leadingCalled = false;
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = undefined;
    }
  }

  const debounced = function (...args: Parameters<T>): void {
    lastArgs = args;
    isPending = true;

    // Leading edge
    if (leading && !leadingCalled) {
      leadingCalled = true;
      fn(...args);
    }

    // Clear existing timer
    if (timer) clearTimeout(timer);

    // Set new timer
    timer = setTimeout(() => {
      timer = undefined;
      if (!leading || lastArgs) {
        execute();
      } else {
        isPending = false;
        leadingCalled = false;
      }
    }, wait);

    // Max wait timer
    if (maxWait !== undefined && !maxTimer) {
      maxTimer = setTimeout(() => {
        maxTimer = undefined;
        if (timer) clearTimeout(timer);
        timer = undefined;
        execute();
      }, maxWait);
    }
  } as DebouncedFunction<T>;

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    if (maxTimer) clearTimeout(maxTimer);
    timer = undefined;
    maxTimer = undefined;
    lastArgs = undefined;
    isPending = false;
    leadingCalled = false;
  };

  debounced.flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    execute();
  };

  Object.defineProperty(debounced, "pending", {
    get: () => isPending,
  });

  return debounced;
}

// ── Rate Limiter ───────────────────────────────────────────────────────

/**
 * Rate limiter using a sliding window.
 *
 * @example
 * ```ts
 * import { RateLimiter } from "@corvid-agent/throttle";
 *
 * const limiter = new RateLimiter({ limit: 10, window: 1000 });
 *
 * // Returns true if allowed
 * if (limiter.tryAcquire()) {
 *   await makeApiCall();
 * }
 *
 * // Or use with auto-queue
 * const limitedFetch = limiter.wrap(fetch);
 * ```
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private drainTimer?: ReturnType<typeof setTimeout>;

  readonly limit: number;
  readonly window: number;
  readonly strategy: "drop" | "queue" | "error";

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.window = options.window;
    this.strategy = options.strategy ?? "drop";
  }

  /** Clean up expired timestamps */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.window;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }

  /** Check how many calls remain in the current window */
  remaining(): number {
    this.cleanup();
    return Math.max(0, this.limit - this.timestamps.length);
  }

  /** Time in ms until the next slot opens */
  retryAfter(): number {
    this.cleanup();
    if (this.timestamps.length < this.limit) return 0;
    const oldest = this.timestamps[0];
    return Math.max(0, oldest + this.window - Date.now());
  }

  /**
   * Try to acquire a slot. Returns true if under the limit.
   */
  tryAcquire(): boolean {
    this.cleanup();
    if (this.timestamps.length < this.limit) {
      this.timestamps.push(Date.now());
      return true;
    }
    return false;
  }

  /**
   * Acquire a slot, waiting in queue if strategy is "queue".
   * Throws RateLimitError if strategy is "error".
   * Returns false if strategy is "drop".
   */
  async acquire(): Promise<boolean> {
    if (this.tryAcquire()) return true;

    switch (this.strategy) {
      case "error":
        throw new RateLimitError(this.limit, this.window);
      case "drop":
        return false;
      case "queue":
        return new Promise<boolean>((resolve, reject) => {
          this.queue.push({
            resolve: () => resolve(true),
            reject,
          });
          this.scheduleDrain();
        });
    }
  }

  /** Wrap a function with rate limiting */
  wrap<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const acquired = await this.acquire();
      if (!acquired) {
        throw new RateLimitError(this.limit, this.window);
      }
      return fn(...args);
    };
  }

  /** Reset the rate limiter */
  reset(): void {
    this.timestamps = [];
    // Resolve all queued
    for (const item of this.queue) {
      item.resolve();
    }
    this.queue = [];
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = undefined;
    }
  }

  private scheduleDrain(): void {
    if (this.drainTimer) return;
    const delay = this.retryAfter();
    this.drainTimer = setTimeout(() => {
      this.drainTimer = undefined;
      this.drainQueue();
    }, Math.max(delay, 10));
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.tryAcquire()) {
      const item = this.queue.shift()!;
      item.resolve();
    }
    if (this.queue.length > 0) {
      this.scheduleDrain();
    }
  }
}

// ── Convenience ────────────────────────────────────────────────────────

/**
 * Simple leading-edge throttle — fires immediately then ignores for `wait` ms.
 */
export function throttleLeading<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
): ThrottledFunction<T> {
  return throttle(fn, wait, { leading: true, trailing: false });
}

/**
 * Simple trailing-edge throttle — waits then fires at the end.
 */
export function throttleTrailing<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
): ThrottledFunction<T> {
  return throttle(fn, wait, { leading: false, trailing: true });
}
