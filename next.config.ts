import type { NextConfig } from "next";

// `output: "standalone"` solo aplica fuera de Vercel (Docker / Cloud Run).
// En Vercel el output se maneja automaticamente — si lo seteamos rompe el
// routing y devuelve 404 a todas las paginas.
const isVercel = !!process.env.VERCEL

const nextConfig: NextConfig = {
  output: isVercel ? undefined : "standalone",
  experimental: {
    serverActions: {
      // Permite testear desde proxy local (`gcloud run services proxy`) sin
      // que la proteccion anti-CSRF rechace las server actions.
      // En prod real el origin matchea la URL del servicio automaticamente.
      allowedOrigins: ["localhost:8080", "127.0.0.1:8080"],
    },
  },
};

export default nextConfig;
