"use client";

import { useCallback, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { AggregatedSeriesPoint, Interval } from "@/lib/npm/types";
import { formatCompactNumber } from "@/lib/utils";

interface ZoomRange {
  start: string;
  end: string;
}

function normalizeZoom(start: string, end: string): ZoomRange {
  return start <= end ? { start, end } : { start: end, end: start };
}

const shortDayFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const shortMonthFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

const tooltipNumberFormatter = new Intl.NumberFormat("en");

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatAxisLabel(value: string, interval: Interval) {
  const date = utcDate(value);

  if (interval === "yearly") {
    return value.slice(0, 4);
  }

  if (interval === "monthly") {
    return shortMonthFormatter.format(date);
  }

  return shortDayFormatter.format(date);
}

export function DownloadsChart({
  interval,
  series,
  loading,
}: {
  interval: Interval;
  series: AggregatedSeriesPoint[];
  loading: boolean;
}) {
  const gradientId = useId().replaceAll(":", "");
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);

  const visibleSeries = useMemo(() => {
    if (!zoomRange) {
      return series;
    }

    return series.filter(
      (point) => point.date >= zoomRange.start && point.date <= zoomRange.end
    );
  }, [series, zoomRange]);

  const resetZoom = useCallback(() => {
    setZoomRange(null);
    setDragStart(null);
    setDragEnd(null);
  }, []);

  const handleMouseDown = useCallback(
    (state: { activeLabel?: string } | undefined) => {
      if (!state?.activeLabel) {
        return;
      }

      setDragStart(String(state.activeLabel));
      setDragEnd(String(state.activeLabel));
    },
    []
  );

  const handleMouseMove = useCallback(
    (state: { activeLabel?: string } | undefined) => {
      if (!dragStart || !state?.activeLabel) {
        return;
      }

      setDragEnd(String(state.activeLabel));
    },
    [dragStart]
  );

  const handleMouseUp = useCallback(() => {
    if (!dragStart || !dragEnd || dragStart === dragEnd) {
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    setZoomRange(normalizeZoom(dragStart, dragEnd));
    setDragStart(null);
    setDragEnd(null);
  }, [dragEnd, dragStart]);

  const formatXAxisLabel = useCallback(
    (value: string) => formatAxisLabel(value, interval),
    [interval]
  );

  const formatYAxisLabel = useCallback(
    (value: number) => formatCompactNumber(value),
    []
  );

  const formatTooltipValue = useCallback(
    (value: number | string | (number | string)[]) =>
      tooltipNumberFormatter.format(
        Number(Array.isArray(value) ? value[0] : value)
      ),
    []
  );

  const formatTooltipLabel = useCallback(
    (_value: string, payload?: { payload?: AggregatedSeriesPoint }[]) =>
      String(payload?.[0]?.payload?.label ?? payload?.[0]?.payload?.date ?? ""),
    []
  );

  const hasSelection = dragStart && dragEnd && dragStart !== dragEnd;

  return (
    <div className="relative select-none">
      {zoomRange ? (
        <div className="absolute -top-5 right-4 z-10">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className=""
            onClick={resetZoom}
          >
            Reset zoom
          </Button>
        </div>
      ) : null}

      <ChartContainer
        config={{
          downloads: {
            label: "Downloads",
            color: "var(--chart-1)",
          },
        }}
        className="h-80 w-full bg-card select-none md:h-96"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={visibleSeries}
            margin={{ top: 12, right: 20, left: 12, bottom: 0 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--foreground)"
              strokeOpacity={loading ? 0 : 0.2}
              strokeDasharray="4 4"
            />
            <XAxis
              dataKey="date"
              minTickGap={32}
              tickFormatter={formatXAxisLabel}
              tickLine={{ stroke: "var(--border)", strokeOpacity: loading ? 0 : 0.65 }}
              axisLine={{ stroke: "var(--border)", strokeOpacity: loading ? 0 : 0.65 }}
            />
            <YAxis
              tickFormatter={formatYAxisLabel}
              tickLine={{ stroke: "var(--border)", strokeOpacity: loading ? 0 : 0.65 }}
              axisLine={{ stroke: "var(--border)", strokeOpacity: loading ? 0 : 0.65 }}
              width={56}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={formatTooltipValue}
                  labelFormatter={formatTooltipLabel}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="downloads"
              stroke="var(--chart-1)"
              fill={`url(#${gradientId})`}
              strokeWidth={2}
              isAnimationActive={!loading}
              dot={{
                r: 2.5,
                fill: "var(--chart-1)",
                stroke: "var(--card)",
                strokeWidth: 1.5,
              }}
              activeDot={{
                r: 4,
                fill: "var(--chart-1)",
                stroke: "var(--card)",
                strokeWidth: 2,
              }}
            />
            {hasSelection ? (
              <ReferenceArea
                x1={dragStart}
                x2={dragEnd ?? dragStart}
                fill="var(--accent)"
                fillOpacity={0.24}
                stroke="var(--accent)"
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
