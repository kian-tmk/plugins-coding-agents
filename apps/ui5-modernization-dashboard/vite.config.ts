import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const INPUT = process.env.INPUT;
if (!INPUT) {
  throw new Error("INPUT environment variable is not set");
}

const isDevelopment = process.env.NODE_ENV === "development";

// Build identity burned in at build time so the UI can show which version it is
// and flag a stale runtime copy against the server's own build string.
function buildVersion(): string {
  let hash = "dev";
  try {
    hash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch { /* not a git checkout — keep "dev" */ }
  return `${hash} · ${new Date().toISOString().slice(0, 16)}`;
}

export default defineConfig({
  plugins: [viteSingleFile()],
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion()),
  },
  build: {
    sourcemap: isDevelopment ? "inline" : undefined,
    cssMinify: !isDevelopment,
    minify: !isDevelopment,
    rollupOptions: {
      input: INPUT,
    },
    outDir: "dist",
    emptyOutDir: false,
  },
});
