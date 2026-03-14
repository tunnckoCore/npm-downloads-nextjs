import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { PackagePageClient } from "@/components/package-page-client";
import { decodePackageParam } from "@/lib/npm/routes";
import { cachedPackageExists } from "@/lib/package-exists.server";

export default function PackagePage({
  params,
}: {
  params: Promise<{ package: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <PackagePageContent params={params} />
    </Suspense>
  );
}

async function PackagePageContent({
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
