/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Las páginas legales viven en español (/privacidad y /terminos). Las direcciones de antes siguen funcionando.
  async redirects() {
    return [
      { source: '/privacy', destination: '/privacidad', permanent: true },
      { source: '/terms', destination: '/terminos', permanent: true },
    ]
  },
}

export default nextConfig
