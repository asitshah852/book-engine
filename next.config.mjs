/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cover art is fetched at runtime from third-party catalog hosts and rendered
  // as CSS background-images, so we don't route it through next/image.
};

export default nextConfig;
