import { NextResponse } from "next/server";

import { getPackageMetadata } from "@/lib/npm/metadata";
import { decodePackageParam } from "@/lib/npm/routes";
import { NpmUpstreamError } from "@/lib/npm/upstream";

function toErrorResponse(error: unknown) {
  if (error instanceof NpmUpstreamError) {
    return NextResponse.json(
      { error: error.message || "npm registry request failed." },
      { status: error.status >= 400 ? error.status : 502 }
    );
  }

  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "Unknown request failure.",
    },
    { status: 500 }
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ package: string }> }
) {
  try {
    const { package: packageParam } = await context.params;
    const metadata = await getPackageMetadata(decodePackageParam(packageParam));

    return NextResponse.json(metadata, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
