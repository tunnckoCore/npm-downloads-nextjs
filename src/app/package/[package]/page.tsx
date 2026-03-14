import { redirect } from "next/navigation";

import { PackagePageClient } from "@/components/package-page-client";
import { decodePackageParam } from "@/lib/npm/routes";
import { packageExists } from "@/lib/package-exists";

export const dynamic = "force-dynamic";

export default async function PackagePage({
  params,
}: {
  params: Promise<{ package: string }>;
}) {
  const requestStartedAt = Date.now();
  const resolved = await params;
  const packageName = decodePackageParam(resolved.package);

  if (!(await packageExists(packageName))) {
    redirect("/");
  }

  return (
    <PackagePageClient
      packageName={packageName}
      requestStartedAt={requestStartedAt}
    />
  );
}
