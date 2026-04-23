import { aggregateSeries, summarizeSeries, trimSeriesToRange } from "@/lib/npm/aggregate";
import { loadPackagesHistoryShards } from "@/lib/npm/batcher";
import type { DateRange, Interval } from "@/lib/npm/types";
import { fetchJsonWithRetry } from "@/lib/npm/upstream";

const NPM_AUTHOR_SEARCH_BASE = "https://registry.npmjs.org/-/v1/search";
const NPM_AUTHOR_SEARCH_PAGE_SIZE = 250;

interface NpmAuthorSearchResponse {
  total?: number;
  objects?: {
    package?: {
      name?: string;
      version?: string;
      description?: string;
    };
  }[];
}

export interface AuthorPackage {
  description: string;
  name: string;
  version: string;
}

export interface AuthorDownloadsPayload {
  author: string;
  interval: Interval;
  packageCount: number;
  packageDownloads: Record<string, number>;
  range: DateRange;
  series: {
    date: string;
    downloads: number;
    label: string;
  }[];
  summary: {
    totalDownloads: number;
    averageDailyDownloads: number;
    totalDays: number;
    peakDay: {
      date: string;
      downloads: number;
    } | null;
  };
}

async function fetchAuthorPackagesPage(
  author: string,
  from: number,
  size: number
): Promise<NpmAuthorSearchResponse> {
  const searchParams = new URLSearchParams({
    text: `maintainer:${author}`,
    from: String(from),
    size: String(size),
  });

  return fetchJsonWithRetry<NpmAuthorSearchResponse>(
    `${NPM_AUTHOR_SEARCH_BASE}?${searchParams}`
  );
}

export async function fetchAuthorPackages(
  author: string,
  size?: number
): Promise<AuthorPackage[]> {
  const normalizedAuthor = author.replace(/^@/, "").trim();
  if (!normalizedAuthor) {
    return [];
  }

  const limit = size && size > 0 ? size : Number.POSITIVE_INFINITY;
  const packages = new Map<string, AuthorPackage>();
  let from = 0;
  let total = Number.POSITIVE_INFINITY;

  try {
    while (from < total && packages.size < limit) {
      const remaining = limit - packages.size;
      const pageSize = Number.isFinite(remaining)
        ? Math.min(NPM_AUTHOR_SEARCH_PAGE_SIZE, remaining)
        : NPM_AUTHOR_SEARCH_PAGE_SIZE;
      const payload = await fetchAuthorPackagesPage(
        normalizedAuthor,
        from,
        pageSize
      );

      total = payload.total ?? 0;
      const entries = (payload.objects ?? [])
        .map((entry) => ({
          description: entry.package?.description ?? "",
          name: entry.package?.name ?? "",
          version: entry.package?.version ?? "",
        }))
        .filter((entry) => entry.name.length > 0);

      for (const entry of entries) {
        packages.set(entry.name, entry);
      }

      if (entries.length === 0) {
        break;
      }

      from += entries.length;
    }

    return [...packages.values()];
  } catch {
    return [...packages.values()];
  }
}

export async function buildAuthorDownloadsPayload(input: {
  author: string;
  range: DateRange;
  interval: Interval;
  size?: number;
  packages?: AuthorPackage[];
}): Promise<AuthorDownloadsPayload> {
  const author = input.author.replace(/^@/, "").trim();
  if (!author) {
    const dailySeries: { date: string; downloads: number }[] = [];
    return {
      author,
      interval: input.interval,
      packageCount: 0,
      packageDownloads: {},
      range: input.range,
      series: aggregateSeries(dailySeries, input.interval),
      summary: summarizeSeries(dailySeries),
    };
  }

  const packages = input.packages ?? (await fetchAuthorPackages(author, input.size));
  const packageNames = [...new Set(packages.map((pkg) => pkg.name))];
  if (packageNames.length === 0) {
    const dailySeries: { date: string; downloads: number }[] = [];
    return {
      author,
      interval: input.interval,
      packageCount: 0,
      packageDownloads: {},
      range: input.range,
      series: aggregateSeries(dailySeries, input.interval),
      summary: summarizeSeries(dailySeries),
    };
  }

  try {
    const results = await loadPackagesHistoryShards(packageNames, input.range);
    const merged = new Map<string, number>();
    const packageDownloads: Record<string, number> = {};

    for (const packageName of packageNames) {
      const entry = results.get(packageName);
      if (!entry) {
        continue;
      }

      const points = trimSeriesToRange(
        entry.shards,
        input.range.from,
        input.range.to
      );
      const totalDownloads = points.reduce(
        (sum, point) => sum + point.downloads,
        0
      );

      packageDownloads[packageName] = totalDownloads;

      for (const point of points) {
        merged.set(point.date, (merged.get(point.date) ?? 0) + point.downloads);
      }
    }

    const dailySeries = [...merged.entries()]
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([date, downloads]) => ({ date, downloads }));

    return {
      author,
      interval: input.interval,
      packageCount: packageNames.length,
      packageDownloads,
      range: input.range,
      series: aggregateSeries(dailySeries, input.interval),
      summary: summarizeSeries(dailySeries),
    };
  } catch {
    const dailySeries: { date: string; downloads: number }[] = [];
    return {
      author,
      interval: input.interval,
      packageCount: packageNames.length,
      packageDownloads: {},
      range: input.range,
      series: aggregateSeries(dailySeries, input.interval),
      summary: summarizeSeries(dailySeries),
    };
  }
}
