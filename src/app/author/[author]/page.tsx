import Link from "next/link";
import { connection } from "next/server";

import { DownloadsChart } from "@/components/downloads-chart";
import { SubjectSearch } from "@/components/subject-search";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultDateRange } from "@/lib/npm/date";
import { buildAuthorDownloadsPayload, fetchAuthorPackages } from "@/lib/npm/author";
import { encodePackagePath } from "@/lib/npm/routes";
import { INTERVALS } from "@/lib/npm/types";
import { cn, formatCompactNumber } from "@/lib/utils";

function decodeAuthorParam(param: string) {
  try {
    return decodeURIComponent(param).trim();
  } catch {
    return param.trim();
  }
}

function firstValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseAuthorRange(searchParams: Record<string, string | string[] | undefined>) {
  const defaults = defaultDateRange();
  const from = firstValue(searchParams.from) || defaults.from;
  const to = firstValue(searchParams.to) || defaults.to;
  const interval = firstValue(searchParams.interval);
  const normalizedInterval = INTERVALS.includes(interval as (typeof INTERVALS)[number])
    ? (interval as (typeof INTERVALS)[number])
    : "monthly";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from >= to) {
    return {
      from: defaults.from,
      to: defaults.to,
      interval: normalizedInterval,
    };
  }

  return { from, to, interval: normalizedInterval };
}

export default async function AuthorPage({
  params,
  searchParams,
}: {
  params: Promise<{ author: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const authorName = decodeAuthorParam(resolvedParams.author).replace(/^@/, "");
  const range = parseAuthorRange(resolvedSearchParams);
  const [packages, downloads] = await Promise.all([
    fetchAuthorPackages(authorName),
    buildAuthorDownloadsPayload({
      author: authorName,
      range: {
        from: range.from,
        to: range.to,
      },
      interval: range.interval,
    }),
  ]);
  const queryString = new URLSearchParams({
    from: range.from,
    to: range.to,
    interval: range.interval,
  }).toString();

  const intervalOptions = [
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
  ] as const;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <SubjectSearch authorName={authorName} className="pb-2" subject="author" />

      <section className="flex flex-col items-start justify-between gap-4 py-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-3xl">
            @{authorName}
          </h2>
          <div className="flex flex-wrap items-baseline gap-2 text-muted-foreground">
            <span className="text-lg font-bold italic sm:text-xl">
              {formatCompactNumber(downloads.summary.totalDownloads)} downloads
            </span>
            <span className="text-xs sm:text-sm">
              &bull; {downloads.packageCount} packages
            </span>
          </div>
        </div>

        <div className="inline-flex w-fit border border-input bg-secondary/40">
          {intervalOptions.map((option) => (
            <Link
              key={option.value}
              className={cn(
                buttonVariants({
                  variant: range.interval === option.value ? "secondary" : "ghost",
                  size: "sm",
                }),
                "cursor-pointer p-0 px-4"
              )}
              href={`/author/${encodeURIComponent(authorName)}?${new URLSearchParams({
                from: range.from,
                to: range.to,
                interval: option.value,
              }).toString()}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </section>

      <Card>
        <CardContent className="p-0 pr-5 pt-5">
          <DownloadsChart
            interval={range.interval}
            series={downloads.series}
            loading={false}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <Badge className="w-fit" variant="secondary">
            Author
          </Badge>
          <CardTitle className="text-2xl">@{authorName.replace(/^@/, "")}</CardTitle>
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
            <ul className="space-y-3">
              {packages.map((pkg) => (
                <li key={pkg.name} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/package/${encodePackagePath(pkg.name)}?${queryString}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {pkg.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {pkg.version}
                    </span>
                  </div>
                  {pkg.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {pkg.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
