import { describe, test, expect } from "bun:test";
import {
  throttle,
  throttleLeading,
  throttleTrailing,
  debounce,
  RateLimiter,
  RateLimitError,
} from "../src/index";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── throttle ───────────────────────────────────────────────────────────

describe("throttle", () => {
  test("executes immediately on leading edge", () => {
    let calls = 0;
    const throttled = throttle(() => { calls++; }, 100);
    throttled();
    expect(calls).toBe(1);
  });

  test("suppresses calls within wait period", () => {
    let calls = 0;
    const throttled = throttle(() => { calls++; }, 100);
    throttled();
    throttled();
    throttled();
    expect(calls).toBe(1);
  });

  test("executes trailing call after wait", async () => {
    let calls = 0;
    const throttled = throttle(() => { calls++; }, 50);
    throttled();
    throttled();
    throttled();
    expect(calls).toBe(1);
    await wait(70);
    expect(calls).toBe(2); // trailing call
  });

  test("cancel prevents trailing call", async () => {
    let calls = 0;
    const throttled = throttle(() => { calls++; }, 50);
    throttled();
    throttled();
    throttled.cancel();
    await wait(70);
    expect(calls).toBe(1); // no trailing
  });

  test("flush executes immediately", async () => {
    let calls = 0;
    const throttled = throttle(() => { calls++; }, 100);
    throttled();
    throttled();
    throttled.flush();
    expect(calls).toBe(2); // leading + flush
  });

  test("leading: false delays first execution", async () => {
    let calls = 0;
    const throttled = throttle(() => { calls++; }, 50, { leading: false });
    throttled();
    expect(calls).toBe(0);
    await wait(70);
    expect(calls).toBe(1);
  });

  test("trailing: false skips trailing call", async () => {
    let calls = 0;
    const throttled = throttle(() => { calls++; }, 50, { trailing: false });
    throttled();
    throttled();
    throttled();
    expect(calls).toBe(1);
    await wait(70);
    expect(calls).toBe(1); // no trailing
  });

  test("pending reflects state", async () => {
    const throttled = throttle(() => {}, 50);
    expect(throttled.pending).toBe(false);
    throttled();
    throttled(); // triggers trailing schedule
    expect(throttled.pending).toBe(true);
    await wait(70);
    expect(throttled.pending).toBe(false);
  });
});

// ── throttleLeading / throttleTrailing ─────────────────────────────────

describe("throttle variants", () => {
  test("throttleLeading fires immediately, no trailing", async () => {
    let calls = 0;
    const throttled = throttleLeading(() => { calls++; }, 50);
    throttled();
    throttled();
    expect(calls).toBe(1);
    await wait(70);
    expect(calls).toBe(1); // no trailing
  });

  test("throttleTrailing fires after delay, no leading", async () => {
    let calls = 0;
    const throttled = throttleTrailing(() => { calls++; }, 50);
    throttled();
    expect(calls).toBe(0);
    await wait(70);
    expect(calls).toBe(1);
  });
});

// ── debounce ───────────────────────────────────────────────────────────

describe("debounce", () => {
  test("delays execution until calls stop", async () => {
    let calls = 0;
    const debounced = debounce(() => { calls++; }, 50);
    debounced();
    debounced();
    debounced();
    expect(calls).toBe(0);
    await wait(70);
    expect(calls).toBe(1);
  });

  test("resets timer on each call", async () => {
    let calls = 0;
    const debounced = debounce(() => { calls++; }, 50);
    debounced();
    await wait(30);
    debounced(); // reset
    await wait(30);
    expect(calls).toBe(0); // still waiting
    await wait(30);
    expect(calls).toBe(1);
  });

  test("leading: true fires immediately", async () => {
    let calls = 0;
    const debounced = debounce(() => { calls++; }, 50, { leading: true });
    debounced();
    expect(calls).toBe(1);
    debounced();
    debounced();
    await wait(70);
    expect(calls).toBe(2); // leading + trailing
  });

  test("maxWait forces execution", async () => {
    let calls = 0;
    const debounced = debounce(() => { calls++; }, 50, { maxWait: 80 });

    // Keep calling every 30ms — without maxWait, would never execute
    debounced();
    await wait(30);
    debounced();
    await wait(30);
    debounced();
    await wait(30);
    // maxWait should have kicked in around 80ms
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  test("cancel prevents execution", async () => {
    let calls = 0;
    const debounced = debounce(() => { calls++; }, 50);
    debounced();
    debounced.cancel();
    await wait(70);
    expect(calls).toBe(0);
  });

  test("flush executes immediately", async () => {
    let calls = 0;
    let lastArg: string | undefined;
    const debounced = debounce((x: string) => { calls++; lastArg = x; }, 100);
    debounced("hello");
    debounced("world");
    debounced.flush();
    expect(calls).toBe(1);
    expect(lastArg).toBe("world");
  });

  test("pending reflects state", async () => {
    const debounced = debounce(() => {}, 50);
    expect(debounced.pending).toBe(false);
    debounced();
    expect(debounced.pending).toBe(true);
    await wait(70);
    expect(debounced.pending).toBe(false);
  });
});

// ── RateLimiter ────────────────────────────────────────────────────────

describe("RateLimiter", () => {
  test("allows calls within limit", () => {
    const limiter = new RateLimiter({ limit: 3, window: 1000 });
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  test("remaining tracks available slots", () => {
    const limiter = new RateLimiter({ limit: 5, window: 1000 });
    expect(limiter.remaining()).toBe(5);
    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.remaining()).toBe(3);
  });

  test("slots reopen after window expires", async () => {
    const limiter = new RateLimiter({ limit: 2, window: 50 });
    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);
    await wait(70);
    expect(limiter.tryAcquire()).toBe(true);
  });

  test("retryAfter returns time until next slot", () => {
    const limiter = new RateLimiter({ limit: 1, window: 100 });
    limiter.tryAcquire();
    const retry = limiter.retryAfter();
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(100);
  });

  test("strategy: error throws RateLimitError", async () => {
    const limiter = new RateLimiter({ limit: 1, window: 1000, strategy: "error" });
    await limiter.acquire();
    try {
      await limiter.acquire();
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
    }
  });

  test("strategy: drop returns false", async () => {
    const limiter = new RateLimiter({ limit: 1, window: 1000, strategy: "drop" });
    expect(await limiter.acquire()).toBe(true);
    expect(await limiter.acquire()).toBe(false);
  });

  test("strategy: queue waits for slot", async () => {
    const limiter = new RateLimiter({ limit: 1, window: 50, strategy: "queue" });
    await limiter.acquire();
    // This should queue and wait
    const startTime = Date.now();
    const result = await limiter.acquire();
    const elapsed = Date.now() - startTime;
    expect(result).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(30);
  });

  test("wrap creates a rate-limited function", async () => {
    let calls = 0;
    const limiter = new RateLimiter({ limit: 2, window: 1000, strategy: "error" });
    const fn = limiter.wrap(async () => { calls++; return calls; });

    expect(await fn()).toBe(1);
    expect(await fn()).toBe(2);

    try {
      await fn();
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
    }
  });

  test("reset clears all state", () => {
    const limiter = new RateLimiter({ limit: 1, window: 1000 });
    limiter.tryAcquire();
    expect(limiter.remaining()).toBe(0);
    limiter.reset();
    expect(limiter.remaining()).toBe(1);
  });
});
