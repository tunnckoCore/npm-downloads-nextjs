const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16_000];
const MAX_CONCURRENT_REQUESTS = 2;

let nextAllowedRequestAt = 0;

export class NpmUpstreamError extends Error {
  public readonly status: number;
  public readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = "NpmUpstreamError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  return async function runWithLimit<T>(task: () => Promise<T>) {
    await new Promise<void>((resolve) => {
      if (active < maxConcurrent) {
        active += 1;
        resolve();
      } else {
        queue.push(() => {
          active += 1;
          resolve();
        });
      }
    });

    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

const runWithLimit = createLimiter(MAX_CONCURRENT_REQUESTS);

function isRetriable(status: number) {
  return status === 429 || status >= 500;
}

function sleep(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, durationMs);
  });
}

function parseRetryAfterHeader(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, timestamp - Date.now());
}

function parseRetryAfterBody(body: string) {
  try {
    const payload = JSON.parse(body) as {
      retry_after?: number;
      retryAfter?: number;
    };
    const retryAfter = payload.retry_after ?? payload.retryAfter;
    if (!Number.isFinite(retryAfter)) {
      return null;
    }

    return Math.max(0, Number(retryAfter) * 1000);
  } catch {
    return null;
  }
}

function computeRetryAfterMs(response: Response, body: string) {
  return (
    parseRetryAfterHeader(response.headers.get("retry-after")) ??
    parseRetryAfterBody(body)
  );
}

function extractErrorMessage(body: string, status: number) {
  try {
    const payload = JSON.parse(body) as {
      detail?: string;
      error?: string;
      message?: string;
      title?: string;
    };

    return (
      payload.detail ??
      payload.error ??
      payload.message ??
      payload.title ??
      body ??
      `npm upstream returned ${status}`
    );
  } catch {
    return body || `npm upstream returned ${status}`;
  }
}

function withJitter(durationMs: number) {
  return durationMs + Math.floor(Math.random() * 500);
}

export async function fetchJsonWithRetry<T>(url: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const cooldownMs = nextAllowedRequestAt - Date.now();
    if (cooldownMs > 0) {
      await sleep(cooldownMs);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await runWithLimit(() =>
        fetch(url, {
          headers: {
            Accept: "application/json",
          },
          next: { revalidate: 900 },
          signal: controller.signal,
        })
      );

      if (response.ok) {
        return (await response.json()) as T;
      }

      const message = await response.text();
      const retryAfterMs = computeRetryAfterMs(response, message);
      const error = new NpmUpstreamError(
        extractErrorMessage(message, response.status),
        response.status,
        retryAfterMs
      );

      if (!isRetriable(response.status) || attempt === RETRY_DELAYS_MS.length) {
        throw error;
      }

      lastError = error;
      const baseDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 0;
      const waitDurationMs = withJitter(
        Math.max(baseDelay, retryAfterMs ?? 0)
      );
      nextAllowedRequestAt = Math.max(nextAllowedRequestAt, Date.now() + waitDurationMs);
      await sleep(waitDurationMs);
      continue;
    } catch (error) {
      if (error instanceof NpmUpstreamError) {
        lastError = error;
      } else if (error instanceof Error) {
        lastError = error;
      }

      if (attempt === RETRY_DELAYS_MS.length) {
        break;
      }

      const baseDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 0;
      const retryAfterMs =
        error instanceof NpmUpstreamError ? error.retryAfterMs ?? 0 : 0;
      const waitDurationMs = withJitter(Math.max(baseDelay, retryAfterMs));
      nextAllowedRequestAt = Math.max(nextAllowedRequestAt, Date.now() + waitDurationMs);
      await sleep(waitDurationMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Unable to reach the npm downloads API.");
}
