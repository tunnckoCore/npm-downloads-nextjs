import { aggregateSeries, summarizeSeries, trimSeriesToRange } from "@/lib/npm/aggregate";
import { loadPackagesHistoryShards } from "@/lib/npm/batcher";
import type { DateRange, Interval } from "@/lib/npm/types";

const NPM_AUTHOR_SEARCH_BASE = "https://registry.npmjs.org/-/v1/search";

type NpmAuthorSearchResponse = {
  objects?: Array<{
    package?: {
      name?: string;
      version?: string;
      description?: string;
    };
  }>;
};

export type AuthorPackage = {
  description: string;
  name: string;
  version: string;
};

export type AuthorDownloadsPayload = {
  author: string;
  interval: Interval;
  packageCount: number;
  range: DateRange;
  series: Array<{
    date: string;
    downloads: number;
    label: string;
  }>;
  summary: {
    totalDownloads: number;
    averageDailyDownloads: number;
    totalDays: number;
    peakDay: {
      date: string;
      downloads: number;
    } | null;
  };
};

export async function fetchAuthorPackages(
  author: string,
  size = 30
): Promise<AuthorPackage[]> {
  const normalizedAuthor = author.replace(/^@/, "").trim();
  if (!normalizedAuthor) {
    return [];
  }

  const searchParams = new URLSearchParams({
    text: `maintainer:${normalizedAuthor}`,
    size: String(size),
  });

  try {
    const response = await fetch(`${NPM_AUTHOR_SEARCH_BASE}?${searchParams}`, {
      next: { revalidate: 60 * 60 },
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as NpmAuthorSearchResponse;

    return (payload.objects ?? [])
      .map((entry) => ({
        description: entry.package?.description ?? "",
        name: entry.package?.name ?? "",
        version: entry.package?.version ?? "",
      }))
      .filter((entry) => entry.name.length > 0);
  } catch {
    return [];
  }
}

export async function buildAuthorDownloadsPayload(input: {
  author: string;
  range: DateRange;
  interval: Interval;
  size?: number;
}): Promise<AuthorDownloadsPayload> {
  const author = input.author.replace(/^@/, "").trim();
  if (!author) {
    const dailySeries: Array<{ date: string; downloads: number }> = [];
    return {
      author,
      interval: input.interval,
      packageCount: 0,
      range: input.range,
      series: aggregateSeries(dailySeries, input.interval),
      summary: summarizeSeries(dailySeries),
    };
  }

  const packages = await fetchAuthorPackages(author, input.size ?? 30);
  const packageNames = [...new Set(packages.map((pkg) => pkg.name))];
  if (packageNames.length === 0) {
    const dailySeries: Array<{ date: string; downloads: number }> = [];
    return {
      author,
      interval: input.interval,
      packageCount: 0,
      range: input.range,
      series: aggregateSeries(dailySeries, input.interval),
      summary: summarizeSeries(dailySeries),
    };
  }

  try {
    const results = await loadPackagesHistoryShards(packageNames, input.range);
    const merged = new Map<string, number>();

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
      range: input.range,
      series: aggregateSeries(dailySeries, input.interval),
      summary: summarizeSeries(dailySeries),
    };
  } catch {
    const dailySeries: Array<{ date: string; downloads: number }> = [];
    return {
      author,
      interval: input.interval,
      packageCount: packageNames.length,
      range: input.range,
      series: aggregateSeries(dailySeries, input.interval),
      summary: summarizeSeries(dailySeries),
    };
  }
}
