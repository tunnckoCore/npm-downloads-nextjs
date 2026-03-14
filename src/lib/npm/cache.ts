interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStore {
  shards: Map<string, CacheEntry<unknown>>;
  metadata: Map<string, CacheEntry<unknown>>;
  inflightBatches: Map<string, Promise<unknown>>;
  inflightMetadata: Map<string, Promise<unknown>>;
}

declare global {
  var __npmDownloadsStore: CacheStore | undefined;
}

function getStore(): CacheStore {
  if (!globalThis.__npmDownloadsStore) {
    globalThis.__npmDownloadsStore = {
      shards: new Map(),
      metadata: new Map(),
      inflightBatches: new Map(),
      inflightMetadata: new Map(),
    };
  }

  return globalThis.__npmDownloadsStore;
}

export function getCachedShard<T>(key: string) {
  const entry = getStore().shards.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    getStore().shards.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setCachedShard<T>(key: string, value: T, ttlMs: number) {
  getStore().shards.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function getCachedMetadata<T>(key: string) {
  const entry = getStore().metadata.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    getStore().metadata.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setCachedMetadata<T>(key: string, value: T, ttlMs: number) {
  getStore().metadata.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export async function withInflightBatch<T>(
  key: string,
  loader: () => Promise<T>
) {
  const existing = getStore().inflightBatches.get(key) as
    | Promise<T>
    | undefined;
  if (existing) {
    return existing;
  }

  const promise = loader().finally(() => {
    getStore().inflightBatches.delete(key);
  });

  getStore().inflightBatches.set(key, promise);
  return promise;
}

export async function withInflightMetadata<T>(
  key: string,
  loader: () => Promise<T>
) {
  const existing = getStore().inflightMetadata.get(key) as
    | Promise<T>
    | undefined;
  if (existing) {
    return existing;
  }

  const promise = loader().finally(() => {
    getStore().inflightMetadata.delete(key);
  });

  getStore().inflightMetadata.set(key, promise);
  return promise;
}
