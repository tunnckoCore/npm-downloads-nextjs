import Link from "next/link";
import { connection } from "next/server";

import { SubjectSearch } from "@/components/subject-search";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAuthorPackages } from "@/lib/npm/author";
import { encodePackagePath } from "@/lib/npm/routes";

function decodeAuthorParam(param: string) {
  try {
    return decodeURIComponent(param).trim();
  } catch {
    return param.trim();
  }
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ author: string }>;
}) {
  await connection();
  const resolved = await params;
  const authorName = decodeAuthorParam(resolved.author);
  const packages = await fetchAuthorPackages(authorName);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <SubjectSearch className="pb-2" />

      <Card>
        <CardHeader className="space-y-3">
          <Badge className="w-fit" variant="secondary">
            Author
          </Badge>
          <CardTitle className="text-2xl">@{authorName.replace(/^@/, "")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Showing npm packages maintained by this author. Pick a package to
            open detailed download analytics.
          </p>

          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No maintained packages found for this author yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {packages.map((pkg) => (
                <li key={pkg.name} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/package/${encodePackagePath(pkg.name)}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {pkg.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {pkg.version}
                    </span>
                  </div>
                  {pkg.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {pkg.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
