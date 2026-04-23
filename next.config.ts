import path from "node:path";
import { fileURLToPath } from "node:url";

import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const withMDX = createMDX();

const nextConfig: NextConfig = {
  cacheComponents: true,
  cleanDistDir: true,
  pageExtensions: ["ts", "tsx", "mdx"],
  reactStrictMode: true,
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default withMDX(nextConfig);
