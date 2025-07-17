import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Amplify用にstandaloneモードに変更
  images: {
    unoptimized: true,
  },
  typescript: {
    // ignoreBuildErrors: true,
  },
  // 環境変数の設定
  env: {
    NEXT_PUBLIC_N8N_WEBHOOK_URL: process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || 'https://clado.app.n8n.cloud/webhook-test/abk-ask',
  },
};

export default nextConfig;
