const NPM_AUTHOR_SEARCH_BASE = "https://registry.npmjs.org/-/v1/search";

type NpmAuthorSearchResponse = {
  objects?: Array<{
    package?: {
      name?: string;
      version?: string;
      description?: string;
    };
  }>;
};

export type AuthorPackage = {
  description: string;
  name: string;
  version: string;
};

export async function fetchAuthorPackages(
  author: string,
  size = 30
): Promise<AuthorPackage[]> {
  const normalizedAuthor = author.replace(/^@/, "").trim();
  if (!normalizedAuthor) {
    return [];
  }

  const searchParams = new URLSearchParams({
    text: `maintainer:${normalizedAuthor}`,
    size: String(size),
  });

  const response = await fetch(`${NPM_AUTHOR_SEARCH_BASE}?${searchParams}`, {
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as NpmAuthorSearchResponse;

  return (payload.objects ?? [])
    .map((entry) => ({
      description: entry.package?.description ?? "",
      name: entry.package?.name ?? "",
      version: entry.package?.version ?? "",
    }))
    .filter((entry) => entry.name.length > 0);
}
