"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";

import { DownloadsChart } from "@/components/downloads-chart";
import { SubjectSearch } from "@/components/subject-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { mergeSeriesChunks } from "@/lib/npm/aggregate";
import { defaultDateRange } from "@/lib/npm/date";
import { encodePackagePath } from "@/lib/npm/routes";
import { INTERVALS } from "@/lib/npm/types";
import type { PackageDownloadsPayload, PackageMetadata } from "@/lib/npm/types";
import { formatCompactNumber } from "@/lib/utils";

const intervalOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

const PRIORITY_AUTHOR = "tunnckocore";

function authorHref(author: string) {
  return `/author/${encodeURIComponent(author)}`;
}

function buildBasePath(packageName: string) {
  return `/api/v1/package/${encodePackagePath(packageName)}`;
}

function prioritizeMaintainers(maintainers: string[]) {
  const priorityIndex = maintainers.findIndex(
    (maintainer) => maintainer.toLowerCase() === PRIORITY_AUTHOR
  );

  if (priorityIndex <= 0) {
    return maintainers;
  }

  return [
    maintainers[priorityIndex],
    ...maintainers.slice(0, priorityIndex),
    ...maintainers.slice(priorityIndex + 1),
  ];
}

function makeDownloadsCacheKey(
  packageName: string,
  from: string,
  to: string,
  interval: PackageDownloadsPayload["interval"]
) {
  return ["package-downloads", packageName, from, to, interval].join(":");
}

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

const emptyPayload = (
  packageName: string,
  from: string,
  to: string,
  interval: PackageDownloadsPayload["interval"]
): PackageDownloadsPayload => ({
  packageName,
  range: { from, to },
  interval,
  summary: {
    totalDownloads: 0,
    averageDailyDownloads: 0,
    totalDays: 0,
    peakDay: null,
  },
  series: [],
  cache: {
    hits: 0,
    misses: 0,
    windows: 0,
  },
});

export function PackagePageClient({ packageName }: { packageName: string }) {
  const queryClient = useQueryClient();
  const defaults = useMemo(() => defaultDateRange(), []);
  const [queryState, setQueryState] = useQueryStates({
    from: parseAsString.withDefault(defaults.from),
    to: parseAsString.withDefault(defaults.to),
    interval: parseAsStringLiteral(INTERVALS).withDefault("monthly"),
  });
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(true);
  const [loadingSource, setLoadingSource] = useState<
    "interval" | "search" | null
  >(null);
  const [displayPayload, setDisplayPayload] =
    useState<PackageDownloadsPayload | null>(null);
  const displayPayloadRef = useRef<PackageDownloadsPayload | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const previousDisplayPayloadRef = useRef<PackageDownloadsPayload | null>(
    null
  );
  const restoreDownloadsKeyRef = useRef<string | null>(null);
  const completedPayloadsRef = useRef(
    new Map<string, PackageDownloadsPayload>()
  );

  const downloadsQueryKey = useMemo(
    () =>
      [
        "package-downloads",
        packageName,
        queryState.from,
        queryState.to,
        queryState.interval,
      ] as const,
    [packageName, queryState.from, queryState.interval, queryState.to]
  );

  const downloadsJsonUrl = `${buildBasePath(packageName)}/downloads?from=${queryState.from}&to=${queryState.to}&interval=${queryState.interval}`;
  const streamUrl = `${buildBasePath(packageName)}/downloads/stream?from=${queryState.from}&to=${queryState.to}&interval=${queryState.interval}`;
  const downloadsCacheKey = makeDownloadsCacheKey(
    packageName,
    queryState.from,
    queryState.to,
    queryState.interval
  );

  const metadataQuery = useQuery({
    queryKey: ["package-metadata", packageName],
    queryFn: () => readJson<PackageMetadata>(buildBasePath(packageName)),
  });

  const handleSeriesChunk = useCallback(
    (payload: {
      series: PackageDownloadsPayload["series"];
      progress: {
        loadedWindows: number;
        totalWindows: number;
      };
    }) => {
      startTransition(() => {
        const current =
          queryClient.getQueryData<PackageDownloadsPayload>(
            downloadsQueryKey
          ) ??
          emptyPayload(
            packageName,
            queryState.from,
            queryState.to,
            queryState.interval
          );

        const nextPayload = {
          ...current,
          series: mergeSeriesChunks(current.series, payload.series),
        };

        queryClient.setQueryData<PackageDownloadsPayload>(
          downloadsQueryKey,
          nextPayload
        );
        setDisplayPayload(nextPayload);
      });
    },
    [
      downloadsQueryKey,
      packageName,
      queryClient,
      queryState.from,
      queryState.interval,
      queryState.to,
    ]
  );

  const handleDone = useCallback(
    (payload: PackageDownloadsPayload) => {
      queryClient.setQueryData(downloadsQueryKey, payload);
      completedPayloadsRef.current.set(downloadsCacheKey, payload);
      setDisplayPayload(payload);
      setLoadingSource(null);
      setIsStreaming(false);
      setStreamError(null);
    },
    [downloadsCacheKey, downloadsQueryKey, queryClient]
  );

  const handleFallback = useCallback(async () => {
    const abortController = new AbortController();
    fallbackAbortRef.current = abortController;

    try {
      const payload = await queryClient.fetchQuery<PackageDownloadsPayload>({
        queryKey: downloadsQueryKey,
        queryFn: () =>
          readJson<PackageDownloadsPayload>(downloadsJsonUrl, {
            signal: abortController.signal,
          }),
      });
      if (cancelledRef.current) {
        return;
      }
      queryClient.setQueryData(downloadsQueryKey, payload);
      completedPayloadsRef.current.set(downloadsCacheKey, payload);
      setDisplayPayload(payload);
      setLoadingSource(null);
      setStreamError(null);
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      setStreamError(
        error instanceof Error
          ? error.message
          : "Unable to load package history."
      );
    } finally {
      if (fallbackAbortRef.current === abortController) {
        fallbackAbortRef.current = null;
      }
      if (!cancelledRef.current) {
        setLoadingSource(null);
        setIsStreaming(false);
      }
    }
  }, [downloadsCacheKey, downloadsJsonUrl, downloadsQueryKey, queryClient]);

  const handleCancelLoading = useCallback(() => {
    cancelledRef.current = true;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    fallbackAbortRef.current?.abort();
    fallbackAbortRef.current = null;
    if (previousDisplayPayloadRef.current) {
      restoreDownloadsKeyRef.current = makeDownloadsCacheKey(
        packageName,
        previousDisplayPayloadRef.current.range.from,
        previousDisplayPayloadRef.current.range.to,
        previousDisplayPayloadRef.current.interval
      );
      setDisplayPayload(previousDisplayPayloadRef.current);
      setQueryState({
        from: previousDisplayPayloadRef.current.range.from,
        to: previousDisplayPayloadRef.current.range.to,
        interval: previousDisplayPayloadRef.current.interval,
      });
    }
    setLoadingSource(null);
    setIsStreaming(false);
    setStreamError(null);
  }, [packageName, setQueryState]);

  useEffect(() => {
    displayPayloadRef.current = displayPayload;
  }, [displayPayload]);

  useEffect(() => {
    cancelledRef.current = false;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    fallbackAbortRef.current?.abort();
    fallbackAbortRef.current = null;
    previousDisplayPayloadRef.current = displayPayloadRef.current;

    const current =
      queryClient.getQueryData<PackageDownloadsPayload>(downloadsQueryKey);
    const cachedCompletedPayload =
      completedPayloadsRef.current.get(downloadsCacheKey) ?? null;
    const isRestoringCompletedPayload =
      restoreDownloadsKeyRef.current === downloadsCacheKey;

    if (cachedCompletedPayload) {
      setDisplayPayload(cachedCompletedPayload);
    }

    if (isRestoringCompletedPayload) {
      restoreDownloadsKeyRef.current = null;
      setLoadingSource(null);
      setIsStreaming(false);
      setStreamError(null);
      return;
    }

    if (!current) {
      queryClient.setQueryData(
        downloadsQueryKey,
        emptyPayload(
          packageName,
          queryState.from,
          queryState.to,
          queryState.interval
        )
      );
    }

    setIsStreaming(true);
    setStreamError(null);

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;
    let completed = false;

    eventSource.addEventListener("series_chunk", (event) => {
      if (cancelledRef.current) {
        return;
      }
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        series: PackageDownloadsPayload["series"];
        progress: {
          loadedWindows: number;
          totalWindows: number;
        };
      };
      handleSeriesChunk(payload);
    });

    eventSource.addEventListener("done", (event) => {
      if (cancelledRef.current) {
        return;
      }
      const payload = JSON.parse(
        (event as MessageEvent<string>).data
      ) as PackageDownloadsPayload;
      completed = true;
      handleDone(payload);
      eventSourceRef.current = null;
      eventSource.close();
    });

    eventSource.addEventListener("stream_error", (event) => {
      if (cancelledRef.current) {
        return;
      }
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        message?: string;
      };

      completed = true;
      eventSourceRef.current = null;
      eventSource.close();
      setLoadingSource(null);
      setStreamError(payload.message ?? "Unable to stream package history.");
      setIsStreaming(false);
    });

    eventSource.addEventListener("error", () => {
      if (completed || cancelledRef.current) {
        return;
      }

      eventSourceRef.current = null;
      eventSource.close();
      handleFallback().catch(() => {
        // Error state is already tracked in component state.
      });
    });

    return () => {
      eventSourceRef.current = null;
      eventSource.close();
    };
  }, [
    downloadsCacheKey,
    downloadsQueryKey,
    handleDone,
    handleFallback,
    handleSeriesChunk,
    packageName,
    queryClient,
    queryState.from,
    queryState.interval,
    queryState.to,
    streamUrl,
  ]);

  const downloads = displayPayload;
  const deferredSeries = useDeferredValue(displayPayload?.series ?? []);
  const visibleSummaryPayload =
    isStreaming && previousDisplayPayloadRef.current
      ? previousDisplayPayloadRef.current
      : downloads;
  const orderedMaintainers = useMemo(
    () => prioritizeMaintainers(metadataQuery.data?.maintainers ?? []),
    [metadataQuery.data?.maintainers]
  );
  const visibleAuthors = orderedMaintainers.slice(0, 3);
  const hiddenAuthorsCount = Math.max(
    0,
    orderedMaintainers.length - visibleAuthors.length
  );
  const isInitialLoading = isStreaming && deferredSeries.length === 0;
  const isFirstPageLoad =
    isStreaming &&
    loadingSource === null &&
    previousDisplayPayloadRef.current === null &&
    completedPayloadsRef.current.size === 0;

  const handleIntervalClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setLoadingSource("interval");
      setQueryState({
        interval: event.currentTarget.value as (typeof INTERVALS)[number],
      });
    },
    [setQueryState]
  );

  const handleSearchTransitionStart = useCallback(() => {
    setLoadingSource("search");
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-4 px-5 py-10 sm:px-6 sm:py-20">
      <SubjectSearch
        packageName={packageName}
        isLoading={loadingSource === "search"}
        isSearchDisabled={isFirstPageLoad}
        onCancel={handleCancelLoading}
        onSearchStart={handleSearchTransitionStart}
      />

      <section className="flex flex-col items-start justify-between gap-4 py-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          {metadataQuery.data?.npmUrl ? (
            <Link
              href={metadataQuery.data.npmUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 uppercase text-2xl font-extrabold tracking-tight text-foreground transition-colors hover:text-muted-foreground sm:text-3xl"
            >
              {metadataQuery.data.name?.toUpperCase()}{" "}
              <ArrowSquareOutIcon className="h-4 w-4" />
            </Link>
          ) : (
            <h2 className="text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-3xl">
              {packageName.toUpperCase()}
            </h2>
          )}

          <div className="flex flex-wrap items-baseline gap-2 text-muted-foreground">
            <span
              className={
                isStreaming
                  ? "animate-pulse text-lg font-bold italic sm:text-xl"
                  : "text-lg font-bold italic sm:text-xl"
              }
            >
              {visibleSummaryPayload
                ? formatCompactNumber(
                    visibleSummaryPayload.summary.totalDownloads
                  )
                : "0"}{" "}
              downloads
            </span>

            {visibleAuthors.length > 0 ? (
              <span className="inline-flex flex-wrap items-baseline gap-1 text-xs leading-6 sm:text-sm">
                <span className="pr-1">&bull;</span>
                {visibleAuthors.map((author, index) => (
                  <span key={author}>
                    {index > 0 ? ", " : ""}
                    <Link
                      href={authorHref(author)}
                      className="underline underline-offset-4 transition-colors hover:text-foreground"
                    >
                      {author}
                    </Link>
                  </span>
                ))}
                {hiddenAuthorsCount > 0 ? ` +${hiddenAuthorsCount} more` : ""}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-start gap-2">
          <div className="inline-flex w-fit border border-input bg-secondary/40">
            {intervalOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                value={option.value}
                variant={
                  queryState.interval === option.value ? "secondary" : "ghost"
                }
                size="sm"
                className="cursor-pointer p-0 px-4"
                onClick={handleIntervalClick}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <Card>
        <CardContent className="relative p-0 pr-5 pt-5">
          {streamError ? (
            <div className="m-10 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
              {streamError}
            </div>
          ) : null}

          <DownloadsChart
            interval={queryState.interval}
            series={deferredSeries}
            loading={isInitialLoading}
          />

          {isInitialLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-transparent">
              <div className="flex flex-col items-center justify-center space-y-6 py-20 animate-in fade-in duration-500">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full border-t-2 border-primary opacity-80 animate-spin"
                    style={{ animationDuration: "1s" }}
                  />
                  <div
                    className="absolute inset-2 rounded-full border-r-2 border-primary opacity-50 animate-spin"
                    style={{
                      animationDuration: "1.5s",
                      animationDirection: "reverse",
                    }}
                  />
                  <div
                    className="absolute inset-4 rounded-full border-b-2 border-primary opacity-30 animate-spin"
                    style={{ animationDuration: "2s" }}
                  />
                  <div className="absolute inset-6 rounded-full border-b-2 border-primary animate-spin" />
                  {/*<CircleNotchIcon className="h-4 w-4 animate-spin text-primary" />*/}
                </div>
                <div className="animate-pulse flex flex-col items-center space-y-1">
                  <div className="text-lg font-medium tracking-tight text-foreground/80">
                    Crunching npm data...
                  </div>
                  <div className="text-sm text-muted-foreground sm:hidden">
                    Fetching package history...
                  </div>
                  <div className="hidden text-sm text-muted-foreground sm:block">
                    Fetching records from the registry. This might take a
                    moment.
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
