import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Permite testear desde proxy local (`gcloud run services proxy`) sin
      // que la protección anti-CSRF rechace las server actions.
      // En prod real el origin matchea la URL del servicio automáticamente.
      allowedOrigins: ["localhost:8080", "127.0.0.1:8080"],
    },
  },
};

export default nextConfig;
