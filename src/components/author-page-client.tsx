"use client";

import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { DownloadsChart } from "@/components/downloads-chart";
import { SubjectSearch } from "@/components/subject-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuthorDownloadsPayload, AuthorPackage } from "@/lib/npm/author";
import {
  cancelAuthorDownloads,
  makeAuthorDownloadsCacheKey,
  subscribeAuthorDownloads,
  unsubscribeAuthorDownloads,
  useAuthorDownloadsEntry,
} from "@/lib/npm/author-downloads-store";
import { defaultDateRange } from "@/lib/npm/date";
import { encodePackagePath } from "@/lib/npm/routes";
import { INTERVALS } from "@/lib/npm/types";
import { formatCompactNumber } from "@/lib/utils";

const intervalOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

const AUTHOR_LIST_PAGE_SIZE = 50;

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
  const [loadingSource, setLoadingSource] = useState<
    "interval" | "search" | null
  >(null);
  const [visibleCount, setVisibleCount] = useState(AUTHOR_LIST_PAGE_SIZE);

  const displayPayloadRef = useRef<AuthorDownloadsPayload | null>(null);
  const previousDisplayPayloadRef = useRef<AuthorDownloadsPayload | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const downloadsCacheKey = makeAuthorDownloadsCacheKey(
    authorName,
    queryState.from,
    queryState.to,
    queryState.interval
  );
  const currentEntry = useAuthorDownloadsEntry(downloadsCacheKey);
  const displayPayload = currentEntry?.payload ?? null;
  const isStreaming = currentEntry?.status === "streaming";
  const streamError = currentEntry?.error ?? null;

  useEffect(() => {
    previousDisplayPayloadRef.current = displayPayloadRef.current;
  }, [downloadsCacheKey]);

  useEffect(() => {
    displayPayloadRef.current = displayPayload;
  }, [displayPayload]);

  useEffect(() => {
    subscribeAuthorDownloads({
      authorName,
      from: queryState.from,
      interval: queryState.interval,
      packages,
      to: queryState.to,
    });

    return () => {
      unsubscribeAuthorDownloads(downloadsCacheKey);
    };
  }, [
    authorName,
    downloadsCacheKey,
    packages,
    queryState.from,
    queryState.interval,
    queryState.to,
  ]);

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

  const hasProgress =
    (displayPayload?.series.length ?? 0) > 0 ||
    (displayPayload?.summary.totalDownloads ?? 0) > 0;
  const visiblePayload =
    isStreaming && previousDisplayPayloadRef.current && !hasProgress
      ? previousDisplayPayloadRef.current
      : displayPayload;
  const deferredSeries = useDeferredValue(visiblePayload?.series ?? []);
  const visiblePackageDownloads = visiblePayload?.packageDownloads ?? {};
  const visiblePackages = useMemo(
    () => packages.slice(0, visibleCount),
    [packages, visibleCount]
  );
  const shouldPulseSummary = isStreaming;
  const isInitialLoading =
    isStreaming &&
    !previousDisplayPayloadRef.current &&
    (displayPayload?.series.length ?? 0) === 0;
  const authorStatusMessage = streamError;

  const handleIntervalClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    cancelAuthorDownloads(downloadsCacheKey);
    setLoadingSource("interval");
    setQueryState({
      interval: event.currentTarget.value as (typeof INTERVALS)[number],
    });
  };

  const handleSearchTransitionStart = () => {
    cancelAuthorDownloads(downloadsCacheKey);
    setLoadingSource("search");
  };

  const handleCancelLoading = () => {
    cancelAuthorDownloads(downloadsCacheKey);

    if (previousDisplayPayloadRef.current) {
      setQueryState({
        from: previousDisplayPayloadRef.current.range.from,
        to: previousDisplayPayloadRef.current.range.to,
        interval: previousDisplayPayloadRef.current.interval,
      });
    }

    setLoadingSource(null);
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
          <h2 className="text-2xl font-extrabold lowercase tracking-tight text-foreground sm:text-3xl">
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
              {visiblePayload
                ? formatCompactNumber(visiblePayload.summary.totalDownloads)
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

      {authorStatusMessage ? (
        <Card size="sm">
          <CardContent>
            <p className="text-sm text-foreground">
              {authorStatusMessage || "some error message"}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="relative p-0 pr-5 pt-5">
          <DownloadsChart
            interval={queryState.interval}
            series={deferredSeries}
            loading={isInitialLoading}
          />

          {isInitialLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-transparent">
              <div className="flex animate-in fade-in flex-col items-center justify-center space-y-6 py-20 duration-500">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div
                    className="absolute inset-0 animate-spin rounded-full border-t-2 border-primary opacity-80"
                    style={{ animationDuration: "1s" }}
                  />
                  <div
                    className="absolute inset-2 animate-spin rounded-full border-r-2 border-primary opacity-50"
                    style={{
                      animationDirection: "reverse",
                      animationDuration: "1.5s",
                    }}
                  />
                  <div
                    className="absolute inset-4 animate-spin rounded-full border-b-2 border-primary opacity-30"
                    style={{ animationDuration: "2s" }}
                  />
                  <div className="absolute inset-6 animate-spin rounded-full border-b-2 border-primary" />
                </div>
                <div className="flex animate-pulse flex-col items-center space-y-1">
                  <div className="text-lg font-medium tracking-tight text-foreground/80">
                    Crunching author downloads...
                  </div>
                  <div className="text-sm text-muted-foreground sm:hidden">
                    Loading packages in the background...
                  </div>
                  <div className="hidden text-sm text-muted-foreground sm:block">
                    Aggregating package histories progressively. This might take
                    a moment.
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle className="text-2xl">@{authorName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="pb-2 text-sm text-muted-foreground">
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
                  const hasPackageDownloads =
                    Object.prototype.hasOwnProperty.call(
                      visiblePackageDownloads,
                      pkg.name
                    );
                  const packageDownloads =
                    visiblePackageDownloads[pkg.name] ?? 0;

                  return (
                    <li key={pkg.name} className="rounded-md border p-4">
                      <div className="flex items-start justify-between gap-4">
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
