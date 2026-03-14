import {
  aggregateSeries,
  summarizeSeries,
  trimSeriesToRange,
} from "@/lib/npm/aggregate";
import { loadPackageHistoryShards } from "@/lib/npm/batcher";
import { enumerateYearShards } from "@/lib/npm/date";
import { parseDownloadsRequest } from "@/lib/npm/query";
import { decodePackageParam } from "@/lib/npm/routes";
import type {
  DailyDownloadPoint,
  PackageDownloadsPayload,
} from "@/lib/npm/types";

function sseMessage(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ package: string }> }
) {
  const { package: packageParam } = await context.params;
  const packageName = decodePackageParam(packageParam);
  const parsed = parseDownloadsRequest(
    packageName,
    new URL(request.url).searchParams
  );
  const windows = enumerateYearShards(parsed.range);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let hits = 0;
      let misses = 0;
      const fullDailySeries: DailyDownloadPoint[] = [];

      controller.enqueue(
        encoder.encode(
          sseMessage("meta", {
            packageName,
            range: parsed.range,
            interval: parsed.interval,
            totalWindows: windows.length,
          })
        )
      );

      try {
        for (const [index, window] of windows.entries()) {
          const { shards, stats } = await loadPackageHistoryShards(
            packageName,
            window
          );
          const trimmed = trimSeriesToRange(
            shards,
            parsed.range.from,
            parsed.range.to
          );

          hits += stats.hits;
          misses += stats.misses;
          fullDailySeries.push(...trimmed);

          controller.enqueue(
            encoder.encode(
              sseMessage("series_chunk", {
                series: aggregateSeries(trimmed, parsed.interval),
                progress: {
                  loadedWindows: index + 1,
                  totalWindows: windows.length,
                },
              })
            )
          );
        }

        const payload: PackageDownloadsPayload = {
          packageName,
          range: parsed.range,
          interval: parsed.interval,
          summary: summarizeSeries(fullDailySeries),
          series: aggregateSeries(fullDailySeries, parsed.interval),
          cache: {
            hits,
            misses,
            windows: windows.length,
          },
        };

        controller.enqueue(encoder.encode(sseMessage("done", payload)));
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            sseMessage("stream_error", {
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to stream package history.",
            })
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
