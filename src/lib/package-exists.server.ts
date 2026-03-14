import { cacheLife, cacheTag } from "next/cache";

export async function cachedPackageExists(packageName: string) {
  "use cache";

  cacheLife("minutes");
  cacheTag(`package-exists:${packageName}`);

  try {
    const response = await fetch(`https://unpkg.com/${packageName}`, {
      cache: "force-cache",
      method: "GET",
      redirect: "follow",
    });
    return response.ok;
  } catch {
    return false;
  }
}
