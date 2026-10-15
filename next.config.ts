import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Done here rather than in a page: a redirect thrown while rendering fails the server
  // render, and the page then hydrates against mismatched HTML.
  async redirects() {
    return [{ source: "/", destination: "/files", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
