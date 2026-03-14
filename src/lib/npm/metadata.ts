import {
  getCachedMetadata,
  setCachedMetadata,
  withInflightMetadata,
} from "@/lib/npm/cache";
import type { PackageMetadata } from "@/lib/npm/types";
import { fetchJsonWithRetry } from "@/lib/npm/upstream";

const METADATA_TTL_MS = 1000 * 60 * 60 * 24;

function isDefinedString(value: string | undefined): value is string {
  return value !== undefined;
}

interface RegistryMetadataResponse {
  name: string;
  description?: string;
  "dist-tags"?: {
    latest?: string;
  };
  maintainers?: {
    name?: string;
  }[];
  keywords?: string[];
}

function metadataKey(packageName: string) {
  return `meta:${packageName}`;
}

export async function getPackageMetadata(packageName: string) {
  const key = metadataKey(packageName);
  const cached = getCachedMetadata<PackageMetadata>(key);

  if (cached) {
    return cached;
  }

  return withInflightMetadata(key, async () => {
    const encodedName = packageName
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const response = await fetchJsonWithRetry<RegistryMetadataResponse>(
      `https://registry.npmjs.org/${encodedName}`
    );

    const metadata: PackageMetadata = {
      name: response.name,
      description:
        response.description ??
        "No description published for this package yet.",
      latestVersion: response["dist-tags"]?.latest ?? null,
      maintainers: (response.maintainers ?? [])
        .map((maintainer) => maintainer.name)
        .filter(isDefinedString),
      keywords: response.keywords ?? [],
      npmUrl: `https://www.npmjs.com/package/${packageName}`,
    };

    setCachedMetadata(key, metadata, METADATA_TTL_MS);
    return metadata;
  });
}
