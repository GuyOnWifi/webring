/** @type {import('next').NextConfig} */
// Static export → deploys to GitHub Pages (no server, no Vercel).
// basePath is only needed if hosted at username.github.io/<repo>; for a user/org
// page or custom domain leave NEXT_PUBLIC_BASE_PATH unset.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};
