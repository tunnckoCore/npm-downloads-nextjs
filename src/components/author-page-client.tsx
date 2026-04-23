"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { DownloadsChart } from "@/components/downloads-chart";
import { SubjectSearch } from "@/components/subject-search";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mergeSeriesChunks } from "@/lib/npm/aggregate";
import { defaultDateRange } from "@/lib/npm/date";
import type {
  AuthorDownloadsPayload,
  AuthorPackage,
} from "@/lib/npm/author";
import { encodePackagePath } from "@/lib/npm/routes";
import { INTERVALS } from "@/lib/npm/types";
import { formatCompactNumber } from "@/lib/utils";

const intervalOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

const AUTHOR_LIST_PAGE_SIZE = 50;
const AUTHOR_DOWNLOADS_STORAGE_KEY = "npm-downloads:author-downloads";

function makeAuthorDownloadsCacheKey(
  authorName: string,
  from: string,
  to: string,
  interval: AuthorDownloadsPayload["interval"]
) {
  return ["author-downloads", authorName, from, to, interval].join(":");
}

function readStoredAuthorPayload(cacheKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(AUTHOR_DOWNLOADS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const payloads = JSON.parse(raw) as Record<string, AuthorDownloadsPayload>;
    return payloads[cacheKey] ?? null;
  } catch {
    return null;
  }
}

function storeAuthorPayload(cacheKey: string, payload: AuthorDownloadsPayload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = window.sessionStorage.getItem(AUTHOR_DOWNLOADS_STORAGE_KEY);
    const payloads = raw
      ? (JSON.parse(raw) as Record<string, AuthorDownloadsPayload>)
      : {};

    payloads[cacheKey] = payload;
    window.sessionStorage.setItem(
      AUTHOR_DOWNLOADS_STORAGE_KEY,
      JSON.stringify(payloads)
    );
  } catch {
    // Ignore session storage failures.
  }
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

function emptyPayload(
  authorName: string,
  packageCount: number,
  from: string,
  to: string,
  interval: AuthorDownloadsPayload["interval"]
): AuthorDownloadsPayload {
  return {
    author: authorName,
    interval,
    packageCount,
    range: { from, to },
    packageDownloads: {},
    series: [],
    summary: {
      totalDownloads: 0,
      averageDailyDownloads: 0,
      totalDays: 0,
      peakDay: null,
    },
  };
}

function mergePackageDownloads(
  current: Record<string, number>,
  incoming: Record<string, number>
) {
  return {
    ...current,
    ...incoming,
  };
}

function mergeSummaries(
  current: AuthorDownloadsPayload["summary"],
  incoming: AuthorDownloadsPayload["summary"]
): AuthorDownloadsPayload["summary"] {
  const totalDownloads = current.totalDownloads + incoming.totalDownloads;
  const totalDays = Math.max(current.totalDays, incoming.totalDays);
  const peakDay =
    !current.peakDay ||
    (incoming.peakDay && incoming.peakDay.downloads > current.peakDay.downloads)
      ? incoming.peakDay
      : current.peakDay;

  return {
    totalDownloads,
    totalDays,
    peakDay,
    averageDailyDownloads: totalDays === 0 ? 0 : totalDownloads / totalDays,
  };
}

export function AuthorPageClient({
  authorName,
  packages,
}: {
  authorName: string;
  packages: AuthorPackage[];
}) {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [queryState, setQueryState] = useQueryStates({
    from: parseAsString.withDefault(defaults.from),
    to: parseAsString.withDefault(defaults.to),
    interval: parseAsStringLiteral(INTERVALS).withDefault("monthly"),
  });
  const [displayPayload, setDisplayPayload] =
    useState<AuthorDownloadsPayload | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(true);
  const [loadingSource, setLoadingSource] = useState<
    "interval" | "search" | null
  >(null);
  const [visibleCount, setVisibleCount] = useState(AUTHOR_LIST_PAGE_SIZE);

  const displayPayloadRef = useRef<AuthorDownloadsPayload | null>(null);
  const previousDisplayPayloadRef = useRef<AuthorDownloadsPayload | null>(null);
  const completedPayloadsRef = useRef(new Map<string, AuthorDownloadsPayload>());
  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const restoreDownloadsKeyRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const downloadsJsonUrl = `/api/v1/author/${encodeURIComponent(authorName)}/downloads?from=${queryState.from}&to=${queryState.to}&interval=${queryState.interval}`;
  const streamUrl = `/api/v1/author/${encodeURIComponent(authorName)}/downloads/stream?from=${queryState.from}&to=${queryState.to}&interval=${queryState.interval}`;
  const downloadsCacheKey = makeAuthorDownloadsCacheKey(
    authorName,
    queryState.from,
    queryState.to,
    queryState.interval
  );

  useEffect(() => {
    displayPayloadRef.current = displayPayload;
  }, [displayPayload]);

  useEffect(() => {
    setVisibleCount(AUTHOR_LIST_PAGE_SIZE);
  }, [authorName, packages.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleCount >= packages.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        setVisibleCount((current) =>
          Math.min(current + AUTHOR_LIST_PAGE_SIZE, packages.length)
        );
      },
      {
        rootMargin: "600px 0px",
      }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [packages.length, visibleCount]);

  useEffect(() => {
    cancelledRef.current = false;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    fallbackAbortRef.current?.abort();
    fallbackAbortRef.current = null;
    previousDisplayPayloadRef.current = displayPayloadRef.current;

    const cachedCompletedPayload =
      completedPayloadsRef.current.get(downloadsCacheKey) ??
      readStoredAuthorPayload(downloadsCacheKey);
    const isRestoringCompletedPayload =
      restoreDownloadsKeyRef.current === downloadsCacheKey;

    if (cachedCompletedPayload) {
      completedPayloadsRef.current.set(downloadsCacheKey, cachedCompletedPayload);
      setDisplayPayload(cachedCompletedPayload);
    }

    if (isRestoringCompletedPayload) {
      restoreDownloadsKeyRef.current = null;
      setLoadingSource(null);
      setIsStreaming(false);
      setStreamError(null);
      return;
    }

    if (!cachedCompletedPayload) {
      setDisplayPayload(
        emptyPayload(
          authorName,
          packages.length,
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
        packageDownloads: Record<string, number>;
        series: AuthorDownloadsPayload["series"];
        summary: AuthorDownloadsPayload["summary"];
      };

      setDisplayPayload((current) => {
        const base =
          current ??
          emptyPayload(
            authorName,
            packages.length,
            queryState.from,
            queryState.to,
            queryState.interval
          );

        return {
          ...base,
          packageDownloads: mergePackageDownloads(
            base.packageDownloads,
            payload.packageDownloads
          ),
          series: mergeSeriesChunks(base.series, payload.series),
          summary: mergeSummaries(base.summary, payload.summary),
        };
      });
    });

    eventSource.addEventListener("done", (event) => {
      if (cancelledRef.current) {
        return;
      }

      const payload = JSON.parse(
        (event as MessageEvent<string>).data
      ) as AuthorDownloadsPayload;
      completed = true;
      completedPayloadsRef.current.set(downloadsCacheKey, payload);
      storeAuthorPayload(downloadsCacheKey, payload);
      setDisplayPayload(payload);
      setLoadingSource(null);
      setIsStreaming(false);
      setStreamError(null);
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
      setStreamError(payload.message ?? "Unable to stream author history.");
      setIsStreaming(false);
    });

    eventSource.addEventListener("error", () => {
      if (completed || cancelledRef.current) {
        return;
      }

      eventSourceRef.current = null;
      eventSource.close();

      const abortController = new AbortController();
      fallbackAbortRef.current = abortController;

      readJson<AuthorDownloadsPayload>(downloadsJsonUrl, {
        signal: abortController.signal,
      })
        .then((payload) => {
          if (cancelledRef.current) {
            return;
          }

          completedPayloadsRef.current.set(downloadsCacheKey, payload);
          storeAuthorPayload(downloadsCacheKey, payload);
          setDisplayPayload(payload);
          setLoadingSource(null);
          setStreamError(null);
        })
        .catch((error) => {
          if (abortController.signal.aborted) {
            return;
          }

          setStreamError(
            error instanceof Error
              ? error.message
              : "Unable to load author history."
          );
        })
        .finally(() => {
          if (fallbackAbortRef.current === abortController) {
            fallbackAbortRef.current = null;
          }
          if (!cancelledRef.current) {
            setLoadingSource(null);
            setIsStreaming(false);
          }
        });
    });

    return () => {
      eventSourceRef.current = null;
      eventSource.close();
    };
  }, [
    authorName,
    downloadsCacheKey,
    downloadsJsonUrl,
    packages.length,
    queryState.from,
    queryState.interval,
    queryState.to,
    streamUrl,
  ]);

  const downloads = displayPayload;
  const hasProgress =
    (displayPayload?.series.length ?? 0) > 0 ||
    (displayPayload?.summary.totalDownloads ?? 0) > 0;
  const visiblePayload =
    isStreaming && previousDisplayPayloadRef.current && !hasProgress
      ? previousDisplayPayloadRef.current
      : downloads;
  const deferredSeries = useDeferredValue(visiblePayload?.series ?? []);
  const visibleSummaryPayload = visiblePayload;
  const visiblePackageDownloads = visiblePayload?.packageDownloads ?? {};
  const visiblePackages = useMemo(
    () => packages.slice(0, visibleCount),
    [packages, visibleCount]
  );
  const hasResolvedPayload =
    (visiblePayload?.series.length ?? 0) > 0 ||
    (visiblePayload?.summary.totalDownloads ?? 0) > 0;
  const hasCompletedPayloadForCurrentKey = completedPayloadsRef.current.has(
    downloadsCacheKey
  );
  const shouldPulseSummary =
    isStreaming && !hasCompletedPayloadForCurrentKey;
  const isInitialLoading =
    isStreaming &&
    !previousDisplayPayloadRef.current &&
    (displayPayload?.series.length ?? 0) === 0;

  const handleIntervalClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setLoadingSource("interval");
    setQueryState({
      interval: event.currentTarget.value as (typeof INTERVALS)[number],
    });
  };

  const handleSearchTransitionStart = () => {
    setLoadingSource("search");
  };

  const handleCancelLoading = () => {
    cancelledRef.current = true;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    fallbackAbortRef.current?.abort();
    fallbackAbortRef.current = null;

    if (previousDisplayPayloadRef.current) {
      restoreDownloadsKeyRef.current = makeAuthorDownloadsCacheKey(
        authorName,
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
  };

  const packageQueryString = new URLSearchParams({
    from: queryState.from,
    to: queryState.to,
    interval: queryState.interval,
  }).toString();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-4 px-5 py-10 sm:px-6 sm:py-20">
      <SubjectSearch
        authorName={authorName}
        subject="author"
        isLoading={loadingSource === "search"}
        onCancel={handleCancelLoading}
        onSearchStart={handleSearchTransitionStart}
      />

      <section className="flex flex-col items-start justify-between gap-4 py-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-3xl">
            @{authorName}
          </h2>
          <div className="flex flex-wrap items-baseline gap-2 text-muted-foreground">
            <span
              className={
                shouldPulseSummary
                  ? "animate-pulse text-lg font-bold italic sm:text-xl"
                  : "text-lg font-bold italic sm:text-xl"
              }
            >
              {visibleSummaryPayload
                ? formatCompactNumber(visibleSummaryPayload.summary.totalDownloads)
                : "0"}{" "}
              downloads
            </span>
            <span className="text-xs sm:text-sm">
              &bull; {packages.length} packages
            </span>
          </div>
        </div>

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
                </div>
                <div className="animate-pulse flex flex-col items-center space-y-1">
                  <div className="text-lg font-medium tracking-tight text-foreground/80">
                    Crunching author downloads...
                  </div>
                  <div className="text-sm text-muted-foreground sm:hidden">
                    Loading packages in the background...
                  </div>
                  <div className="hidden text-sm text-muted-foreground sm:block">
                    Aggregating package histories progressively. This might take a moment.
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="space-y-3">
          <Badge className="w-fit" variant="secondary">
            Author
          </Badge>
          <CardTitle className="text-2xl">@{authorName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Showing npm packages maintained by this author. Pick a package to
            open detailed download analytics.
          </p>

          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No maintained packages found for this author yet.
            </p>
          ) : (
            <>
              <ul className="space-y-3">
                {visiblePackages.map((pkg) => {
                  const hasPackageDownloads = Object.prototype.hasOwnProperty.call(
                    visiblePackageDownloads,
                    pkg.name
                  );
                  const packageDownloads = visiblePackageDownloads[pkg.name] ?? 0;

                  return (
                    <li key={pkg.name} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/package/${encodePackagePath(pkg.name)}?${packageQueryString}`}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {pkg.name}
                          </Link>
                          {pkg.description ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {pkg.description}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                          <span className="text-xs text-muted-foreground">
                            {pkg.version}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {hasPackageDownloads
                              ? `${formatCompactNumber(packageDownloads)} downloads`
                              : isStreaming
                                ? "Counting…"
                                : "—"}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {visibleCount < packages.length ? (
                <>
                  <div ref={sentinelRef} className="h-8" />
                  <p className="text-center text-xs text-muted-foreground">
                    Showing {visibleCount} of {packages.length} packages
                  </p>
                </>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
