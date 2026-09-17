import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas', 'tesseract.js', 'mammoth'],
};

export default nextConfig;
