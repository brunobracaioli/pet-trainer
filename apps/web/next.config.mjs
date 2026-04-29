/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages (`@specops/domain`, `@specops/quest-engine`) are
  // exported as raw .ts source. Next.js needs to transpile them.
  transpilePackages: ['@specops/domain', '@specops/quest-engine'],
}

export default nextConfig
