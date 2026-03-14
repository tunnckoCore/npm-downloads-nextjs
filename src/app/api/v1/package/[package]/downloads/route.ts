import { NextResponse } from "next/server";

import { buildPackageDownloadsPayload } from "@/lib/npm/batcher";
import { parseDownloadsRequest } from "@/lib/npm/query";
import { decodePackageParam } from "@/lib/npm/routes";
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
  context: { params: Promise<{ package: string }> }
) {
  try {
    const { package: packageParam } = await context.params;
    const packageName = decodePackageParam(packageParam);
    const parsed = parseDownloadsRequest(
      packageName,
      new URL(request.url).searchParams
    );
    const payload = await buildPackageDownloadsPayload(parsed);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
