import {
  aggregateSeries,
  summarizeSeries,
  trimSeriesToRange,
} from "@/lib/npm/aggregate";
import { fetchAuthorPackages } from "@/lib/npm/author";
import { loadPackagesHistoryShards } from "@/lib/npm/batcher";
import { parseDownloadsRequest } from "@/lib/npm/query";
import type { DailyDownloadPoint } from "@/lib/npm/types";

const AUTHOR_STREAM_CHUNK_SIZE = 10;

function sseMessage(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function chunkPackages<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function toSortedDailySeries(
  merged: Map<string, number>
): DailyDownloadPoint[] {
  return [...merged.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([date, downloads]) => ({ date, downloads }));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ author: string }> }
) {
  const { author: authorParam } = await context.params;
  const parsed = parseDownloadsRequest(
    authorParam,
    new URL(request.url).searchParams
  );
  const packages = await fetchAuthorPackages(parsed.packageName);
  const packageNames = packages.map((pkg) => pkg.name);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          sseMessage("meta", {
            author: parsed.packageName,
            packageCount: packageNames.length,
            range: parsed.range,
            interval: parsed.interval,
            totalChunks: Math.ceil(
              packageNames.length / AUTHOR_STREAM_CHUNK_SIZE
            ),
          })
        )
      );

      const merged = new Map<string, number>();
      const fullPackageDownloads: Record<string, number> = {};
      const chunks = chunkPackages(packageNames, AUTHOR_STREAM_CHUNK_SIZE);

      try {
        for (const [chunkIndex, packageChunk] of chunks.entries()) {
          const results = await loadPackagesHistoryShards(
            packageChunk,
            parsed.range
          );
          const chunkMerged = new Map<string, number>();
          const packageDownloads: Record<string, number> = {};

          for (const packageName of packageChunk) {
            const entry = results.get(packageName);
            if (!entry) {
              continue;
            }

            const trimmedSeries = trimSeriesToRange(
              entry.shards,
              parsed.range.from,
              parsed.range.to
            );
            const totalDownloads = trimmedSeries.reduce(
              (sum, point) => sum + point.downloads,
              0
            );

            packageDownloads[packageName] = totalDownloads;
            fullPackageDownloads[packageName] = totalDownloads;

            for (const point of trimmedSeries) {
              chunkMerged.set(
                point.date,
                (chunkMerged.get(point.date) ?? 0) + point.downloads
              );
              merged.set(
                point.date,
                (merged.get(point.date) ?? 0) + point.downloads
              );
            }
          }

          const chunkDailySeries = toSortedDailySeries(chunkMerged);
          controller.enqueue(
            encoder.encode(
              sseMessage("series_chunk", {
                packageDownloads,
                series: aggregateSeries(chunkDailySeries, parsed.interval),
                summary: summarizeSeries(chunkDailySeries),
                progress: {
                  loadedChunks: chunkIndex + 1,
                  totalChunks: chunks.length,
                },
              })
            )
          );
        }

        const fullDailySeries = toSortedDailySeries(merged);
        controller.enqueue(
          encoder.encode(
            sseMessage("done", {
              author: parsed.packageName,
              packageCount: packageNames.length,
              packageDownloads: fullPackageDownloads,
              range: parsed.range,
              interval: parsed.interval,
              summary: summarizeSeries(fullDailySeries),
              series: aggregateSeries(fullDailySeries, parsed.interval),
            })
          )
        );
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            sseMessage("stream_error", {
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to stream author history.",
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
