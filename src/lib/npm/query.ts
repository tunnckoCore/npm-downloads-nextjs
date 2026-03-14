import { z } from "zod";

import { clampRangeToToday, parseUtcDate } from "@/lib/npm/date";
import { INTERVALS } from "@/lib/npm/types";
import type { DateRange, Interval } from "@/lib/npm/types";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  interval: z.enum(INTERVALS).default("monthly"),
});

export function parseDownloadsRequest(
  packageName: string,
  searchParams: URLSearchParams
): {
  packageName: string;
  range: DateRange;
  interval: Interval;
} {
  const parsed = querySchema.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    interval: searchParams.get("interval") ?? "monthly",
  });

  if (!parsed.success) {
    throw new Error("The request is missing a valid from/to range.");
  }

  const range = clampRangeToToday({
    from: parsed.data.from,
    to: parsed.data.to,
  });

  if (!parseUtcDate(range.from) || !parseUtcDate(range.to)) {
    throw new Error("The request contains an invalid UTC date.");
  }

  if (range.from > range.to) {
    throw new Error("The request range must end after it begins.");
  }

  return {
    packageName: decodeURIComponent(packageName),
    range,
    interval: parsed.data.interval as Interval,
  };
}
