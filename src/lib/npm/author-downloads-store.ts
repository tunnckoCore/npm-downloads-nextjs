"use client";

import { create } from "zustand";

import { mergeSeriesChunks } from "@/lib/npm/aggregate";
import type {
  AuthorDownloadsPayload,
  AuthorPackage,
} from "@/lib/npm/author";
import type { Interval } from "@/lib/npm/types";

const AUTHOR_DOWNLOADS_STORAGE_PREFIX = "npm-downloads:author-downloads:v2:";
const LEGACY_AUTHOR_DOWNLOADS_STORAGE_KEY = "npm-downloads:author-downloads";

type AuthorDownloadsStatus = "idle" | "streaming" | "complete" | "error";

interface AuthorDownloadsProgress {
  loadedChunks: number;
  totalChunks: number;
}

export interface AuthorDownloadsEntry {
  cacheKey: string;
  error: string | null;
  isHydratedPartial: boolean;
  payload: AuthorDownloadsPayload | null;
  progress: AuthorDownloadsProgress | null;
  status: AuthorDownloadsStatus;
  updatedAt: number;
}

interface AuthorDownloadsStoreState {
  entries: Record<string, AuthorDownloadsEntry>;
}

interface AuthorDownloadsSubscriptionInput {
  authorName: string;
  from: string;
  interval: Interval;
  packages: AuthorPackage[];
  to: string;
}

interface PersistedAuthorDownloadsEntry {
  error: string | null;
  isComplete: boolean;
  payload: AuthorDownloadsPayload | null;
  progress: AuthorDownloadsProgress | null;
  updatedAt: number;
}

interface AuthorDownloadsRuntime {
  abortController: AbortController | null;
  eventSource: EventSource | null;
  payload: AuthorDownloadsPayload | null;
  subscribers: number;
}

interface AuthorDownloadsStreamChunkEvent {
  packageDownloads: Record<string, number>;
  progress: AuthorDownloadsProgress;
  series: AuthorDownloadsPayload["series"];
  summary: AuthorDownloadsPayload["summary"];
}

const authorDownloadsRuntimes = new Map<string, AuthorDownloadsRuntime>();

const useAuthorDownloadsStore = create<AuthorDownloadsStoreState>(() => ({
  entries: {},
}));

function emptyPayload(
  authorName: string,
  packageCount: number,
  from: string,
  to: string,
  interval: AuthorDownloadsPayload["interval"]
): AuthorDownloadsPayload {
  return {
    author: authorName,
    interval,
    packageCount,
    range: { from, to },
    packageDownloads: {},
    series: [],
    summary: {
      totalDownloads: 0,
      averageDailyDownloads: 0,
      totalDays: 0,
      peakDay: null,
    },
  };
}

function mergePackageDownloads(
  current: Record<string, number>,
  incoming: Record<string, number>
) {
  return {
    ...current,
    ...incoming,
  };
}

function mergeSummaries(
  current: AuthorDownloadsPayload["summary"],
  incoming: AuthorDownloadsPayload["summary"]
): AuthorDownloadsPayload["summary"] {
  const totalDownloads = current.totalDownloads + incoming.totalDownloads;
  const totalDays = Math.max(current.totalDays, incoming.totalDays);
  const peakDay =
    !current.peakDay ||
    (incoming.peakDay && incoming.peakDay.downloads > current.peakDay.downloads)
      ? incoming.peakDay
      : current.peakDay;

  return {
    totalDownloads,
    totalDays,
    peakDay,
    averageDailyDownloads: totalDays === 0 ? 0 : totalDownloads / totalDays,
  };
}

function makeStorageKey(cacheKey: string) {
  return `${AUTHOR_DOWNLOADS_STORAGE_PREFIX}${cacheKey}`;
}

function readJson<T>(input: RequestInfo, init?: RequestInit) {
  return fetch(input, init).then(async (response) => {
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error ?? `Request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  });
}

function setAuthorDownloadsEntry(
  cacheKey: string,
  updater:
    | AuthorDownloadsEntry
    | ((current: AuthorDownloadsEntry | null) => AuthorDownloadsEntry)
) {
  useAuthorDownloadsStore.setState((state) => {
    const current = state.entries[cacheKey] ?? null;
    const nextEntry =
      typeof updater === "function"
        ? updater(current)
        : updater;

    return {
      entries: {
        ...state.entries,
        [cacheKey]: nextEntry,
      },
    };
  });
}

function readPersistedAuthorDownloadsEntry(cacheKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(makeStorageKey(cacheKey));
    if (raw) {
      const persisted = JSON.parse(raw) as PersistedAuthorDownloadsEntry;
      return {
        cacheKey,
        error: persisted.error,
        isHydratedPartial:
          !persisted.isComplete && persisted.payload !== null,
        payload: persisted.payload,
        progress: persisted.progress,
        status: persisted.isComplete ? "complete" : "streaming",
        updatedAt: persisted.updatedAt,
      } satisfies AuthorDownloadsEntry;
    }
  } catch {
    // Ignore session storage failures.
  }

  try {
    const raw = window.sessionStorage.getItem(LEGACY_AUTHOR_DOWNLOADS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const payloads = JSON.parse(raw) as Record<string, AuthorDownloadsPayload>;
    const payload = payloads[cacheKey] ?? null;
    if (!payload) {
      return null;
    }

    return {
      cacheKey,
      error: null,
      isHydratedPartial: false,
      payload,
      progress: null,
      status: "complete",
      updatedAt: Date.now(),
    } satisfies AuthorDownloadsEntry;
  } catch {
    return null;
  }
}

function persistAuthorDownloadsEntry(
  cacheKey: string,
  entry: AuthorDownloadsEntry
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const persisted: PersistedAuthorDownloadsEntry = {
      error: entry.error,
      isComplete: entry.status === "complete",
      payload: entry.payload,
      progress: entry.progress,
      updatedAt: entry.updatedAt,
    };
    window.sessionStorage.setItem(
      makeStorageKey(cacheKey),
      JSON.stringify(persisted)
    );
  } catch {
    // Ignore session storage failures.
  }
}

function hydrateAuthorDownloadsEntry(cacheKey: string) {
  const existing = useAuthorDownloadsStore.getState().entries[cacheKey] ?? null;
  if (existing) {
    return existing;
  }

  const hydrated = readPersistedAuthorDownloadsEntry(cacheKey);
  if (hydrated) {
    setAuthorDownloadsEntry(cacheKey, hydrated);
    return hydrated;
  }

  return null;
}

function closeAuthorDownloadsRuntime(cacheKey: string) {
  const runtime = authorDownloadsRuntimes.get(cacheKey);
  if (!runtime) {
    return;
  }

  runtime.eventSource?.close();
  runtime.abortController?.abort();
  authorDownloadsRuntimes.delete(cacheKey);
}

function setStreamingEntry(
  cacheKey: string,
  payload: AuthorDownloadsPayload | null,
  progress: AuthorDownloadsProgress | null
) {
  setAuthorDownloadsEntry(cacheKey, (current) => {
    const nextEntry: AuthorDownloadsEntry = {
      cacheKey,
      error: null,
      isHydratedPartial: current?.isHydratedPartial ?? false,
      payload,
      progress,
      status: "streaming",
      updatedAt: Date.now(),
    };

    persistAuthorDownloadsEntry(cacheKey, nextEntry);
    return nextEntry;
  });
}

function startAuthorDownloadsStream(
  cacheKey: string,
  input: AuthorDownloadsSubscriptionInput
) {
  const existingEntry = useAuthorDownloadsStore.getState().entries[cacheKey] ?? null;
  const downloadsJsonUrl = `/api/v1/author/${encodeURIComponent(input.authorName)}/downloads?from=${input.from}&to=${input.to}&interval=${input.interval}`;
  const streamUrl = `/api/v1/author/${encodeURIComponent(input.authorName)}/downloads/stream?from=${input.from}&to=${input.to}&interval=${input.interval}`;
  const runtime: AuthorDownloadsRuntime = {
    abortController: null,
    eventSource: null,
    payload: existingEntry?.status === "complete" ? existingEntry.payload : null,
    subscribers: 1,
  };

  authorDownloadsRuntimes.set(cacheKey, runtime);
  setStreamingEntry(cacheKey, existingEntry?.payload ?? null, existingEntry?.progress ?? null);

  const eventSource = new EventSource(streamUrl);
  runtime.eventSource = eventSource;
  let completed = false;

  eventSource.addEventListener("meta", (event) => {
    const payload = JSON.parse((event as MessageEvent<string>).data) as {
      totalChunks?: number;
    };

    setStreamingEntry(cacheKey, existingEntry?.payload ?? null, {
      loadedChunks: 0,
      totalChunks: payload.totalChunks ?? 0,
    });
  });

  eventSource.addEventListener("series_chunk", (event) => {
    const payload = JSON.parse(
      (event as MessageEvent<string>).data
    ) as AuthorDownloadsStreamChunkEvent;
    const base =
      runtime.payload ??
      emptyPayload(
        input.authorName,
        input.packages.length,
        input.from,
        input.to,
        input.interval
      );

    const nextPayload: AuthorDownloadsPayload = {
      ...base,
      packageDownloads: mergePackageDownloads(
        base.packageDownloads,
        payload.packageDownloads
      ),
      series: mergeSeriesChunks(base.series, payload.series),
      summary: mergeSummaries(base.summary, payload.summary),
    };

    runtime.payload = nextPayload;

    const nextEntry: AuthorDownloadsEntry = {
      cacheKey,
      error: null,
      isHydratedPartial: false,
      payload: nextPayload,
      progress: payload.progress,
      status: "streaming",
      updatedAt: Date.now(),
    };

    setAuthorDownloadsEntry(cacheKey, nextEntry);
    persistAuthorDownloadsEntry(cacheKey, nextEntry);
  });

  eventSource.addEventListener("done", (event) => {
    completed = true;
    const payload = JSON.parse(
      (event as MessageEvent<string>).data
    ) as AuthorDownloadsPayload;
    const nextEntry: AuthorDownloadsEntry = {
      cacheKey,
      error: null,
      isHydratedPartial: false,
      payload,
      progress: null,
      status: "complete",
      updatedAt: Date.now(),
    };

    setAuthorDownloadsEntry(cacheKey, nextEntry);
    persistAuthorDownloadsEntry(cacheKey, nextEntry);
    eventSource.close();
    runtime.eventSource = null;
    runtime.abortController = null;
    authorDownloadsRuntimes.delete(cacheKey);
  });

  eventSource.addEventListener("stream_error", (event) => {
    completed = true;
    const payload = JSON.parse((event as MessageEvent<string>).data) as {
      message?: string;
    };
    const currentPayload = runtime.payload ?? existingEntry?.payload ?? null;
    const nextEntry: AuthorDownloadsEntry = {
      cacheKey,
      error: payload.message ?? "Unable to stream author history.",
      isHydratedPartial: false,
      payload: currentPayload,
      progress: null,
      status: "error",
      updatedAt: Date.now(),
    };

    setAuthorDownloadsEntry(cacheKey, nextEntry);
    persistAuthorDownloadsEntry(cacheKey, nextEntry);
    eventSource.close();
    runtime.eventSource = null;
    runtime.abortController = null;
    authorDownloadsRuntimes.delete(cacheKey);
  });

  eventSource.addEventListener("error", () => {
    if (completed) {
      return;
    }

    eventSource.close();
    runtime.eventSource = null;

    const abortController = new AbortController();
    runtime.abortController = abortController;

    readJson<AuthorDownloadsPayload>(downloadsJsonUrl, {
      signal: abortController.signal,
    })
      .then((payload) => {
        const nextEntry: AuthorDownloadsEntry = {
          cacheKey,
          error: null,
          isHydratedPartial: false,
          payload,
          progress: null,
          status: "complete",
          updatedAt: Date.now(),
        };

        setAuthorDownloadsEntry(cacheKey, nextEntry);
        persistAuthorDownloadsEntry(cacheKey, nextEntry);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        const nextEntry: AuthorDownloadsEntry = {
          cacheKey,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load author history.",
          isHydratedPartial: false,
          payload: runtime.payload ?? existingEntry?.payload ?? null,
          progress: null,
          status: "error",
          updatedAt: Date.now(),
        };

        setAuthorDownloadsEntry(cacheKey, nextEntry);
        persistAuthorDownloadsEntry(cacheKey, nextEntry);
      })
      .finally(() => {
        runtime.abortController = null;
        authorDownloadsRuntimes.delete(cacheKey);
      });
  });
}

export function makeAuthorDownloadsCacheKey(
  authorName: string,
  from: string,
  to: string,
  interval: Interval
) {
  return ["author-downloads", authorName, from, to, interval].join(":");
}

export function subscribeAuthorDownloads(
  input: AuthorDownloadsSubscriptionInput
) {
  const cacheKey = makeAuthorDownloadsCacheKey(
    input.authorName,
    input.from,
    input.to,
    input.interval
  );
  const hydratedEntry = hydrateAuthorDownloadsEntry(cacheKey);
  const runtime = authorDownloadsRuntimes.get(cacheKey);

  if (runtime) {
    runtime.subscribers += 1;
    return cacheKey;
  }

  if (hydratedEntry?.status === "complete") {
    return cacheKey;
  }

  startAuthorDownloadsStream(cacheKey, input);
  return cacheKey;
}

export function unsubscribeAuthorDownloads(cacheKey: string) {
  const runtime = authorDownloadsRuntimes.get(cacheKey);
  if (!runtime) {
    return;
  }

  runtime.subscribers = Math.max(0, runtime.subscribers - 1);
}

export function cancelAuthorDownloads(cacheKey: string) {
  closeAuthorDownloadsRuntime(cacheKey);
  setAuthorDownloadsEntry(cacheKey, (current) => {
    const nextEntry: AuthorDownloadsEntry = {
      cacheKey,
      error: null,
      isHydratedPartial: false,
      payload: current?.payload ?? null,
      progress: null,
      status: current?.status === "complete" ? "complete" : "idle",
      updatedAt: Date.now(),
    };

    persistAuthorDownloadsEntry(cacheKey, nextEntry);
    return nextEntry;
  });
}

export function useAuthorDownloadsEntry(cacheKey: string) {
  return useAuthorDownloadsStore((state) => state.entries[cacheKey] ?? null);
}
