import { NextResponse } from "next/server";

import {
  buildAuthorDownloadsPayload,
  fetchAuthorPackages,
} from "@/lib/npm/author";
import { parseDownloadsRequest } from "@/lib/npm/query";
import { NpmUpstreamError } from "@/lib/npm/upstream";

function toErrorResponse(error: unknown) {
  if (error instanceof NpmUpstreamError) {
    return NextResponse.json(
      { error: error.message || "npm downloads request failed." },
      { status: error.status >= 400 ? error.status : 502 }
    );
  }

  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "Unknown request failure.",
    },
    { status: 400 }
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ author: string }> }
) {
  try {
    const { author: authorParam } = await context.params;
    const parsed = parseDownloadsRequest(
      authorParam,
      new URL(request.url).searchParams
    );
    const packages = await fetchAuthorPackages(parsed.packageName);
    const payload = await buildAuthorDownloadsPayload({
      author: parsed.packageName,
      packages,
      range: parsed.range,
      interval: parsed.interval,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
