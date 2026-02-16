# @corvid-agent/throttle

[![CI](https://github.com/corvid-agent/throttle/actions/workflows/ci.yml/badge.svg)](https://github.com/corvid-agent/throttle/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@corvid-agent/throttle)](https://www.npmjs.com/package/@corvid-agent/throttle)
![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen)

Rate limiter, throttle, and debounce utilities. Zero dependencies. TypeScript-first.

## Install

```bash
npm install @corvid-agent/throttle
```

## Usage

### Throttle

Execute at most once per time window:

```ts
import { throttle } from "@corvid-agent/throttle";

const onScroll = throttle(() => {
  updatePosition();
}, 200);

window.addEventListener("scroll", onScroll);

// Control
onScroll.cancel();  // cancel pending
onScroll.flush();   // execute now
onScroll.pending;   // check if pending
```

### Debounce

Wait until calls stop, then execute:

```ts
import { debounce } from "@corvid-agent/throttle";

const search = debounce(async (query: string) => {
  const results = await fetchResults(query);
  render(results);
}, 300);

input.addEventListener("input", (e) => search(e.target.value));
```

With `maxWait` to guarantee execution:

```ts
const save = debounce(saveDocument, 1000, { maxWait: 5000 });
// Will save at most every 5 seconds, even with continuous typing
```

### Rate Limiter

Sliding window rate limiting:

```ts
import { RateLimiter } from "@corvid-agent/throttle";

const limiter = new RateLimiter({
  limit: 10,
  window: 1000,  // 10 calls per second
  strategy: "queue",  // "drop" | "queue" | "error"
});

// Manual check
if (limiter.tryAcquire()) {
  await makeApiCall();
}

// Async with strategy
const allowed = await limiter.acquire(); // queues, drops, or throws

// Wrap a function
const limitedFetch = limiter.wrap(fetch);
const response = await limitedFetch("/api/data");

// Inspect
limiter.remaining();   // slots left in window
limiter.retryAfter();  // ms until next slot
```

## API

### `throttle(fn, wait, options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `leading` | `boolean` | `true` | Execute on leading edge |
| `trailing` | `boolean` | `true` | Execute on trailing edge |

### `debounce(fn, wait, options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `leading` | `boolean` | `false` | Execute on leading edge |
| `maxWait` | `number` | - | Max delay before forced execution |

### `RateLimiter`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | required | Max calls per window |
| `window` | `number` | required | Window in ms |
| `strategy` | `"drop" \| "queue" \| "error"` | `"drop"` | What to do when limit reached |

### Convenience

```ts
throttleLeading(fn, wait);   // leading only
throttleTrailing(fn, wait);  // trailing only
```

## License

MIT
