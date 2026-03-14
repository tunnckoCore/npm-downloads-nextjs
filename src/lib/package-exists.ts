export async function packageExists(packageName: string) {
  try {
    const response = await fetch(`https://unpkg.com/${packageName}`, {
      cache: "no-store",
      method: "GET",
      redirect: "follow",
    });
    return response.ok;
  } catch {
    return false;
  }

  return false;
}
