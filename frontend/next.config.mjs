import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: avoid inferring a parent folder (e.g. user home) when multiple lockfiles exist
  outputFileTracingRoot: path.join(__dirname, '..'),
};

export default nextConfig;
