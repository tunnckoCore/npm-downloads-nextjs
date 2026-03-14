import type {
  AggregatedSeriesPoint,
  DailyDownloadPoint,
  DownloadsSummary,
  Interval,
  PackageHistoryShard,
} from "@/lib/npm/types";

const LABEL_FORMATTER = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  timeZone: "UTC",
});

function utcDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function toWeekStart(date: string) {
  const current = utcDate(date);
  const day = current.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setUTCDate(current.getUTCDate() + diff);
  return current.toISOString().slice(0, 10);
}

function bucketKey(date: string, interval: Interval) {
  switch (interval) {
    case "daily": {
      return date;
    }
    case "weekly": {
      return toWeekStart(date);
    }
    case "monthly": {
      return `${date.slice(0, 7)}-01`;
    }
    case "yearly": {
      return `${date.slice(0, 4)}-01-01`;
    }
    default: {
      return date;
    }
  }
}

function bucketLabel(key: string, interval: Interval) {
  const date = utcDate(key);

  if (interval === "daily") {
    return LABEL_FORMATTER.format(date);
  }

  if (interval === "weekly") {
    return `Week of ${LABEL_FORMATTER.format(date)}`;
  }

  if (interval === "monthly") {
    return MONTH_FORMATTER.format(date);
  }

  return key.slice(0, 4);
}

export function trimSeriesToRange(
  shards: PackageHistoryShard[],
  from: string,
  to: string
) {
  const merged = new Map<string, number>();

  for (const shard of shards) {
    for (const point of shard.days) {
      if (point.date < from || point.date > to) {
        continue;
      }

      merged.set(point.date, point.downloads);
    }
  }

  return [...merged.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([date, downloads]) => ({ date, downloads }));
}

export function aggregateSeries(
  points: DailyDownloadPoint[],
  interval: Interval
) {
  const buckets = new Map<string, number>();

  for (const point of points) {
    const key = bucketKey(point.date, interval);
    buckets.set(key, (buckets.get(key) ?? 0) + point.downloads);
  }

  return [...buckets.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(
      ([date, downloads]): AggregatedSeriesPoint => ({
        date,
        downloads,
        label: bucketLabel(date, interval),
      })
    );
}

export function summarizeSeries(
  points: DailyDownloadPoint[]
): DownloadsSummary {
  const totalDownloads = points.reduce(
    (sum, point) => sum + point.downloads,
    0
  );
  const peakDay =
    points.reduce<DailyDownloadPoint | null>((currentPeak, point) => {
      if (!currentPeak || point.downloads > currentPeak.downloads) {
        return point;
      }

      return currentPeak;
    }, null) ?? null;

  return {
    totalDownloads,
    averageDailyDownloads:
      points.length === 0 ? 0 : totalDownloads / points.length,
    totalDays: points.length,
    peakDay,
  };
}

export function mergeSeriesChunks(
  existing: AggregatedSeriesPoint[],
  incoming: AggregatedSeriesPoint[]
) {
  const merged = new Map<string, AggregatedSeriesPoint>();

  for (const point of existing) {
    merged.set(point.date, point);
  }

  for (const point of incoming) {
    const previous = merged.get(point.date);
    merged.set(point.date, {
      ...point,
      downloads: previous
        ? previous.downloads + point.downloads
        : point.downloads,
    });
  }

  return [...merged.values()].toSorted((left, right) =>
    left.date.localeCompare(right.date)
  );
}
