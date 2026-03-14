const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [500, 1000, 2000];

export class NpmUpstreamError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NpmUpstreamError";
    this.status = status;
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

const runWithLimit = createLimiter(4);

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

export async function fetchJsonWithRetry<T>(url: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
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

      {
        const message = await response.text();
        const error = new NpmUpstreamError(
          message || `npm upstream returned ${response.status}`,
          response.status
        );

        if (
          !isRetriable(response.status) ||
          attempt === RETRY_DELAYS_MS.length
        ) {
          throw error;
        }

        lastError = error;
      }
    } catch (error) {
      if (error instanceof NpmUpstreamError) {
        lastError = error;
      } else if (error instanceof Error) {
        lastError = error;
      }

      if (attempt === RETRY_DELAYS_MS.length) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }

    await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 0);
  }

  throw lastError ?? new Error("Unable to reach the npm downloads API.");
}
