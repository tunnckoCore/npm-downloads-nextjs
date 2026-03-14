export const INTERVALS = ["daily", "weekly", "monthly", "yearly"] as const;

export type Interval = (typeof INTERVALS)[number];

export interface DateRange {
  from: string;
  to: string;
}

export interface DailyDownloadPoint {
  date: string;
  downloads: number;
}

export interface PackageHistoryShard {
  key: string;
  packageName: string;
  range: DateRange;
  days: DailyDownloadPoint[];
  source: "bulk" | "single";
  fetchedAt: string;
}

export interface AggregatedSeriesPoint {
  date: string;
  label: string;
  downloads: number;
}

export interface DownloadsSummary {
  totalDownloads: number;
  averageDailyDownloads: number;
  totalDays: number;
  peakDay: DailyDownloadPoint | null;
}

export interface CacheStats {
  hits: number;
  misses: number;
  windows: number;
}

export interface PackageDownloadsPayload {
  packageName: string;
  range: DateRange;
  interval: Interval;
  summary: DownloadsSummary;
  series: AggregatedSeriesPoint[];
  cache: CacheStats;
}

export interface PackageMetadata {
  name: string;
  description: string;
  latestVersion: string | null;
  maintainers: string[];
  keywords: string[];
  npmUrl: string;
}

export interface NpmDownloadsEntry {
  downloads: number;
  day: string;
}

export interface SinglePackageDownloadsResponse {
  start: string;
  end: string;
  package: string;
  downloads: NpmDownloadsEntry[];
}

export type BulkPackageDownloadsResponse = Record<
  string,
  SinglePackageDownloadsResponse
>;
