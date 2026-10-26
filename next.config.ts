import type { NextConfig } from "next";

/**
 * Two ways to run:
 *  - default: a normal Next.js server (`npm run dev`, `npm start`)
 *  - STATIC_EXPORT=1: plain HTML/JS files in `out/` for static hosting such as
 *    GitHub Pages (see .github/workflows/deploy-pages.yml). The app keeps all
 *    customer data in the browser, so it needs no server.
 *
 * NEXT_PUBLIC_BASE_PATH sets the sub-path the site is served from (e.g.
 * "/virtual-fitting-room" for https://<user>.github.io/virtual-fitting-room/).
 */
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(staticExport && {
    output: "export",
    // Emit avatar/index.html etc. so static hosts serve /avatar/ without rewrites.
    trailingSlash: true,
  }),
  ...(basePath && { basePath }),
};

export default nextConfig;
