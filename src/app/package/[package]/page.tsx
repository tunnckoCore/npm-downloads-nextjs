import { redirect } from "next/navigation";
import { connection } from "next/server";

import { PackagePageClient } from "@/components/package-page-client";
import { decodePackageParam } from "@/lib/npm/routes";
import { cachedPackageExists } from "@/lib/package-exists.server";

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

  return <PackagePageClient packageName={packageName} />;
}
