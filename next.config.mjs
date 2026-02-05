/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
          {
            protocol: "https",
            hostname: "cdn.shopify.com",
          },
          {
            protocol: "https",
            hostname: "img.youtube.com",
          },
        ],
      },
    };
    

export default nextConfig;
