import { cacheLife, cacheTag } from "next/cache";

import {
  aggregateSeries,
  summarizeSeries,
  trimSeriesToRange,
} from "@/lib/npm/aggregate";
import {
  getCachedShard,
  setCachedShard,
  withInflightBatch,
} from "@/lib/npm/cache";
import { enumerateYearShards, shiftUtcDays } from "@/lib/npm/date";
import type { ShardWindow } from "@/lib/npm/date";
import type {
  BulkPackageDownloadsResponse,
  CacheStats,
  DateRange,
  Interval,
  PackageDownloadsPayload,
  PackageHistoryShard,
  SinglePackageDownloadsResponse,
} from "@/lib/npm/types";
import { fetchJsonWithRetry, NpmUpstreamError } from "@/lib/npm/upstream";

const SHARD_TTL_MS = 1000 * 60 * 60 * 6;
const BULK_URL_SOFT_LIMIT = 1800;
const BATCH_RETRY_DELAYS_MS = [2000, 5000, 10000];

function makeShardKey(packageName: string, window: ShardWindow) {
  return `${packageName}:${window.from}:${window.to}`;
}

function buildUrl(packages: string[], window: ShardWindow) {
  return `https://api.npmjs.org/downloads/range/${window.from}:${window.to}/${packages
    .map((entry) => encodeURIComponent(entry))
    .join(",")}`;
}

function isRecoverableBoundaryError(error: unknown) {
  return (
    error instanceof NpmUpstreamError &&
    error.status === 400 &&
    /end date > start date/i.test(error.message)
  );
}

function isRetriableUpstreamError(error: unknown) {
  return (
    error instanceof NpmUpstreamError &&
    (error.status === 429 || error.status >= 500)
  );
}

function sleep(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function withJitter(durationMs: number) {
  return durationMs + Math.floor(Math.random() * 500);
}

async function fetchSingleWindow(
  packageName: string,
  window: ShardWindow
): Promise<SinglePackageDownloadsResponse> {
  return fetchJsonWithRetry<SinglePackageDownloadsResponse>(
    buildUrl([packageName], window)
  );
}

async function recoverSingleWindow(
  packageName: string,
  window: ShardWindow,
  originalError: NpmUpstreamError
) {
  let cursor = window.from;
  let lastFailedStart = window.from;
  let recovered: SinglePackageDownloadsResponse | null = null;
  let recoveredStart: string | null = null;

  while (cursor <= window.to) {
    try {
      recovered = await fetchSingleWindow(packageName, {
        key: `${window.key}:${cursor}`,
        from: cursor,
        to: window.to,
      });
      recoveredStart = cursor;
      break;
    } catch (error) {
      if (!isRecoverableBoundaryError(error)) {
        throw error;
      }

      lastFailedStart = cursor;
      if (cursor === window.to) {
        break;
      }

      const nextCursor = shiftUtcDays(cursor, 31);
      cursor = nextCursor <= window.to ? nextCursor : window.to;
    }
  }

  if (!recovered || !recoveredStart) {
    throw originalError;
  }

  let candidate = shiftUtcDays(lastFailedStart, 1);

  while (candidate < recoveredStart) {
    try {
      return await fetchSingleWindow(packageName, {
        key: `${window.key}:${candidate}`,
        from: candidate,
        to: window.to,
      });
    } catch (error) {
      if (!isRecoverableBoundaryError(error)) {
        throw error;
      }
    }

    candidate = shiftUtcDays(candidate, 1);
  }

  return recovered;
}

function toShard(
  response: SinglePackageDownloadsResponse,
  source: "bulk" | "single"
): PackageHistoryShard {
  return {
    key: `${response.package}:${response.start}:${response.end}`,
    packageName: response.package,
    range: {
      from: response.start,
      to: response.end,
    },
    days: response.downloads.map((entry) => ({
      date: entry.day,
      downloads: entry.downloads,
    })),
    fetchedAt: new Date().toISOString(),
    source,
  };
}

function chunkPackagesForWindow(packages: string[], window: ShardWindow) {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];

  for (const packageName of [...packages].toSorted()) {
    if (packageName.startsWith("@")) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
      }

      chunks.push([packageName]);
      continue;
    }

    const nextChunk = [...currentChunk, packageName];
    if (
      buildUrl(nextChunk, window).length > BULK_URL_SOFT_LIMIT &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk);
      currentChunk = [packageName];
      continue;
    }

    currentChunk = nextChunk;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function fetchWindowChunk(packages: string[], window: ShardWindow) {
  const sortedPackages = packages.toSorted();
  const batchKey = `${window.key}:${sortedPackages.join(",")}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= BATCH_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await withInflightBatch(batchKey, () =>
        fetchWindowChunkCached(sortedPackages, window)
      );
    } catch (error) {
      lastError = error;

      if (
        !isRetriableUpstreamError(error) ||
        attempt === BATCH_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }

      const baseDelay =
        BATCH_RETRY_DELAYS_MS[attempt] ?? BATCH_RETRY_DELAYS_MS.at(-1) ?? 0;
      const retryAfterMs =
        error instanceof NpmUpstreamError ? (error.retryAfterMs ?? 0) : 0;
      const waitDurationMs = withJitter(Math.max(baseDelay, retryAfterMs));
      await sleep(waitDurationMs);
    }
  }

  throw lastError;
}

async function fetchWindowChunkCached(
  packages: string[],
  window: ShardWindow
): Promise<Record<string, PackageHistoryShard>> {
  "use cache";

  cacheLife("hours");
  cacheTag(
    ...packages.flatMap((packageName) => [
      `package:${packageName}`,
      `package-window:${packageName}:${window.from}:${window.to}`,
    ])
  );

  if (packages.length === 1) {
    try {
      const response = await fetchSingleWindow(packages[0], window);
      return {
        [response.package]: toShard(response, "single"),
      } satisfies Record<string, PackageHistoryShard>;
    } catch (error) {
      if (!isRecoverableBoundaryError(error)) {
        throw error;
      }

      const response = await recoverSingleWindow(
        packages[0],
        window,
        error as NpmUpstreamError
      );
      return {
        [response.package]: toShard(response, "single"),
      } satisfies Record<string, PackageHistoryShard>;
    }
  }

  const url = buildUrl(packages, window);
  const response = await fetchJsonWithRetry<BulkPackageDownloadsResponse>(url);
  const shardMap: Record<string, PackageHistoryShard> = {};

  for (const [packageName, payload] of Object.entries(response)) {
    shardMap[packageName] = toShard(payload, "bulk");
  }

  return shardMap;
}

async function hydrateWindow(window: ShardWindow, packages: string[]) {
  const hydrated = new Map<string, PackageHistoryShard>();

  for (const chunk of chunkPackagesForWindow(packages, window)) {
    const chunkResponse = await fetchWindowChunk(chunk, window);

    for (const packageName of chunk) {
      const shard = chunkResponse[packageName];
      if (!shard) {
        throw new NpmUpstreamError(
          `npm did not return data for ${packageName}`,
          502
        );
      }

      setCachedShard(makeShardKey(packageName, window), shard, SHARD_TTL_MS);
      hydrated.set(packageName, shard);
    }
  }

  return hydrated;
}

export async function loadPackagesHistoryShards(
  packageNames: string[],
  range: DateRange
) {
  const windows = enumerateYearShards(range);
  const results = new Map<
    string,
    {
      shards: PackageHistoryShard[];
      stats: CacheStats;
    }
  >();

  for (const packageName of packageNames) {
    results.set(packageName, {
      shards: [],
      stats: {
        hits: 0,
        misses: 0,
        windows: windows.length,
      },
    });
  }

  for (const window of windows) {
    const missingPackages: string[] = [];

    for (const packageName of packageNames) {
      const cached = getCachedShard<PackageHistoryShard>(
        makeShardKey(packageName, window)
      );
      const existing = results.get(packageName);
      if (!existing) {
        continue;
      }

      if (cached) {
        existing.stats.hits += 1;
        existing.shards.push(cached);
      } else {
        existing.stats.misses += 1;
        missingPackages.push(packageName);
      }
    }

    if (missingPackages.length === 0) {
      continue;
    }

    const hydrated = await hydrateWindow(window, missingPackages);

    for (const packageName of missingPackages) {
      const shard = hydrated.get(packageName);
      if (!shard) {
        throw new Error(`Unable to hydrate ${packageName} for ${window.key}`);
      }

      const existing = results.get(packageName);
      if (!existing) {
        continue;
      }

      existing.shards.push(shard);
    }
  }

  return results;
}

export async function loadPackageHistoryShards(
  packageName: string,
  range: DateRange
) {
  const results = await loadPackagesHistoryShards([packageName], range);
  const entry = results.get(packageName);
  if (!entry) {
    throw new Error(`Unable to load package history for ${packageName}`);
  }

  return {
    shards: entry.shards,
    stats: entry.stats,
  };
}

export async function buildPackageDownloadsPayload(input: {
  packageName: string;
  range: DateRange;
  interval: Interval;
}) {
  const { shards, stats } = await loadPackageHistoryShards(
    input.packageName,
    input.range
  );
  const dailySeries = trimSeriesToRange(
    shards,
    input.range.from,
    input.range.to
  );

  return {
    packageName: input.packageName,
    range: input.range,
    interval: input.interval,
    summary: summarizeSeries(dailySeries),
    series: aggregateSeries(dailySeries, input.interval),
    cache: stats,
  } satisfies PackageDownloadsPayload;
}
