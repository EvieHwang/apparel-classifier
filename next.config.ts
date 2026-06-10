import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: the Dockerfile (feature 6) copies `.next/standalone` into a
  // minimal runtime image and runs `node server.js`. The dashboard route streams
  // Server-Sent Events; nothing here needs static export.
  output: "standalone",
};

export default nextConfig;
