import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { THEME_PRESETS } from "@/lib/theme-presets";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ preset: string }> }
) {
  const { preset } = await params;
  const themePreset = THEME_PRESETS.find((item) => item.value === preset);

  if (!themePreset) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "src", "themes", `${preset}.css`);
  const css = await readFile(filePath, "utf8");

  return new NextResponse(css, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "text/css; charset=utf-8",
    },
  });
}
