/** Load .env (if present) before any other server module reads process.env. */
try {
  // Node >= 20.12 native .env support; no dependency needed.
  process.loadEnvFile();
} catch {
  // No .env file — configuration falls back to process.env defaults.
}
export {};
