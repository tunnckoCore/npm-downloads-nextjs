import type { DateRange } from "@/lib/npm/types";

export type ShardWindow = DateRange & {
  key: string;
};

const MS_IN_DAY = 86_400_000;

export function parseUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (formatUtcDate(date) !== value) {
    return null;
  }

  return date;
}

export function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function todayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

export function shiftUtcDays(value: string, amount: number) {
  const date = parseUtcDate(value);
  if (!date) {
    throw new Error(`Invalid UTC date: ${value}`);
  }
  return formatUtcDate(new Date(date.getTime() + amount * MS_IN_DAY));
}

export function defaultDateRange(yearsBack = 1): DateRange {
  const today = todayUtc();
  const to = formatUtcDate(today);
  const from = formatUtcDate(
    new Date(
      Date.UTC(
        today.getUTCFullYear() - yearsBack,
        today.getUTCMonth(),
        today.getUTCDate()
      )
    )
  );

  return { from, to };
}

export function enumerateYearShards(range: DateRange) {
  const clamped = clampRangeToToday(range);
  const from = parseUtcDate(clamped.from);
  const to = parseUtcDate(clamped.to);

  if (!from || !to) {
    throw new Error("Unable to enumerate year shards for an invalid range.");
  }

  const shards: ShardWindow[] = [];
  let shardStart = clamped.from;
  let index = 0;

  while (shardStart <= clamped.to) {
    const candidateEnd = shiftUtcDays(shardStart, 364);
    const shardEnd = candidateEnd < clamped.to ? candidateEnd : clamped.to;

    shards.push({
      key: `${index}`,
      from: shardStart,
      to: shardEnd,
    });

    if (shardEnd >= clamped.to) {
      break;
    }

    shardStart = shiftUtcDays(shardEnd, 1);
    index += 1;
  }

  return shards;
}

export function clampRangeToToday(range: DateRange) {
  const today = formatUtcDate(todayUtc());
  if (range.to <= today) {
    return range;
  }

  return {
    from: range.from,
    to: today,
  };
}
