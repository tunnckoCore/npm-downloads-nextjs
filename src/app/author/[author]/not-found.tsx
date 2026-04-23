import Link from "next/link";

import { SubjectSearch } from "@/components/subject-search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthorNotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-4 px-5 py-10 sm:px-6 sm:py-20">
      <SubjectSearch subject="author" />

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl sm:text-3xl">
            Author not found
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground sm:text-base">
            We couldn&apos;t find any npm packages maintained by that author.
          </p>
          <p className="text-sm text-muted-foreground sm:text-base">
            Double-check the spelling or search for another npm author.
          </p>
          <Link
            href="/"
            className="inline-flex text-sm font-medium text-primary underline underline-offset-4 hover:text-foreground"
          >
            Back to home
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
