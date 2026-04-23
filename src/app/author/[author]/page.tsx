import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AuthorPageClient } from "@/components/author-page-client";
import { fetchAuthorPackages } from "@/lib/npm/author";

function decodeAuthorParam(param: string) {
  try {
    return decodeURIComponent(param).trim();
  } catch {
    return param.trim();
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ author: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const authorName = decodeAuthorParam(resolved.author).replace(/^@/, "");

  return {
    title: `@${authorName}`,
    description: `Analyze download stats for npm author @${authorName}.`,
    openGraph: {
      title: `@${authorName}`,
      description: `Analyze download stats for npm author @${authorName}.`,
    },
    twitter: {
      title: `@${authorName}`,
      description: `Analyze download stats for npm author @${authorName}.`,
    },
  };
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ author: string }>;
}) {
  await connection();
  const resolved = await params;
  const authorName = decodeAuthorParam(resolved.author).replace(/^@/, "");
  const packages = await fetchAuthorPackages(authorName);

  if (packages.length === 0) {
    notFound();
  }

  return <AuthorPageClient authorName={authorName} packages={packages} />;
}
