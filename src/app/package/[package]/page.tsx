import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { PackagePageClient } from "@/components/package-page-client";
import { getPackageMetadata } from "@/lib/npm/metadata";
import { decodePackageParam } from "@/lib/npm/routes";
import { cachedPackageExists } from "@/lib/package-exists.server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ package: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const packageName = decodePackageParam(resolved.package);

  return {
    title: packageName,
    description: `Analyze download stats for ${packageName} on npm.`,
    openGraph: {
      title: packageName,
      description: `Analyze download stats for ${packageName} on npm.`,
      images: ["/og/package.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: packageName,
      description: `Analyze download stats for ${packageName} on npm.`,
      images: ["/og/package.png"],
    },
  };
}

export default async function PackagePage({
  params,
}: {
  params: Promise<{ package: string }>;
}) {
  await connection();
  const resolved = await params;
  const packageName = decodePackageParam(resolved.package);

  if (!(await cachedPackageExists(packageName))) {
    redirect("/");
  }

  const initialMetadata = await getPackageMetadata(packageName).catch(
    () => null
  );

  return (
    <PackagePageClient
      packageName={packageName}
      initialMetadata={initialMetadata}
    />
  );
}
