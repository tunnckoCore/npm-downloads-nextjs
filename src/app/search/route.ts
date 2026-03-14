import { NextResponse } from "next/server";

import { encodePackagePath } from "@/lib/npm/routes";
import { INTERVALS } from "@/lib/npm/types";
import type { Interval } from "@/lib/npm/types";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const packageName = searchParams.get("query")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const interval = searchParams.get("interval");

  if (!packageName || !from || !to || from >= to) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const normalizedInterval = (
    INTERVALS.includes(interval as Interval) ? interval : "monthly"
  ) as Interval;

  const nextUrl = new URL(
    `/package/${encodePackagePath(packageName)}`,
    request.url
  );
  nextUrl.searchParams.set("from", from);
  nextUrl.searchParams.set("to", to);
  nextUrl.searchParams.set("interval", normalizedInterval);

  return NextResponse.redirect(nextUrl);
}
